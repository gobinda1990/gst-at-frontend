import { apiClient } from "./apiClient";

const BASE = "/gst/return-3b/defaulters";

/* Same rules as the backend, so bad input fails fast instead of costing a 400 round trip. */
const PERIOD_RE = /^(0[1-9]|1[0-2])\d{4}$/; // MMYYYY
const GSTIN_RE = /^[0-9A-Z]{15}$/;
const MAX_MONTHS = 60;
const DEFAULT_MONTHS = 12;

/* A full export can run for minutes; the default axios timeout would cut it off mid-file. */
const EXPORT_TIMEOUT_MS = 10 * 60 * 1000;

/* =========================================================
   HELPERS
========================================================= */

/** Thrown before any request is sent when an argument is clearly invalid. */
export class DefaulterRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "DefaulterRequestError";
  }
}

/**
 * Trims strings and drops undefined / null / blank / NaN values.
 * 0 and false are kept (page=0 is a real value).
 */
export const cleanParams = (params = {}) =>
  Object.fromEntries(
    Object.entries(params || {})
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
      .filter(
        ([, value]) =>
          value !== undefined &&
          value !== null &&
          value !== "" &&
          !(typeof value === "number" && Number.isNaN(value))
      )
  );

/**
 * Works whether the apiClient interceptor returns response.data (assumed) or the full AxiosResponse,
 * so the service does not break if that interceptor changes.
 */
const unwrap = (res) =>
  res && typeof res === "object" && res.config && "status" in res && "data" in res
    ? res.data
    : res;

const requirePeriod = (retPeriod) => {
  const period = String(retPeriod ?? "").trim();
  if (!PERIOD_RE.test(period)) {
    throw new DefaulterRequestError("Return period must be in MMYYYY format, e.g. 032025.");
  }
  return period;
};

/** Cleans a filter object and validates its retPeriod. */
const prepareFilter = (params) => {
  const cleaned = cleanParams(params);
  cleaned.retPeriod = requirePeriod(cleaned.retPeriod);
  return cleaned;
};

/** True when the request was cancelled on purpose (AbortController, unmount, newer request). Ignore these. */
export const isRequestCanceled = (err) =>
  err?.code === "ERR_CANCELED" ||
  err?.name === "CanceledError" ||
  err?.name === "AbortError";

/**
 * Best human-readable message from a failed call. The backend returns RFC 7807 bodies
 * ({ title, detail, status }); network failures and local validation errors have no body.
 */
export const getApiErrorMessage = (err, fallback = "Something went wrong. Please try again.") => {
  if (!err) return fallback;
  if (err instanceof DefaulterRequestError) return err.message;

  const status = err.response?.status;
  const data = err.response?.data;

  if (data && typeof data === "object" && !(data instanceof Blob)) {
    if (typeof data.detail === "string" && data.detail) return data.detail;
    if (typeof data.message === "string" && data.message) return data.message;
  }
  if (status === 429) return "Too many exports are running. Please retry in a moment.";
  if (status === 503) return "The service is temporarily unavailable. Please retry shortly.";
  if (status === 401 || status === 403) return "You are not authorised to view this data.";
  if (err.code === "ECONNABORTED") return "The request timed out. Please try again.";
  if (!err.response && err.request) return "Cannot reach the server. Check your connection.";

  return fallback;
};

/**
 * Keeps only the latest request of a kind: starting a new one aborts the previous one. Use one instance per
 * screen/list so rapid filter or search changes do not pile up (the server sees fewer abandoned requests).
 *
 *   const latest = useRef(createLatestRequest()).current;
 *   try {
 *     const page = await latest.run((signal) => fetchDefaulters(params, { signal }));
 *   } catch (e) {
 *     if (isRequestCanceled(e)) return; // superseded, not an error
 *     ...
 *   }
 *   // on unmount: latest.cancel();
 */
export const createLatestRequest = () => {
  let current = null;

  return {
    run(call) {
      if (current) current.abort();

      const controller = new AbortController();
      current = controller;

      const clear = () => {
        if (current === controller) current = null;
      };

      const promise = call(controller.signal);
      promise.then(clear, clear);
      return promise;
    },
    cancel() {
      if (current) current.abort();
      current = null;
    },
  };
};

/* =========================================================
   RETURN PERIODS
========================================================= */

export const fetchDefaulterPeriods = async ({ signal } = {}) =>
  unwrap(await apiClient.get(`${BASE}/periods`, { signal }));

/* =========================================================
   OFFICES
========================================================= */

export const fetchDefaulterOffices = async (retPeriod, { signal } = {}) =>
  unwrap(
    await apiClient.get(`${BASE}/offices`, {
      params: { retPeriod: requirePeriod(retPeriod) },
      signal,
    })
  );

/* =========================================================
   SUMMARY
========================================================= */

export const fetchDefaulterSummary = async (params, { signal } = {}) =>
  unwrap(
    await apiClient.get(`${BASE}/summary`, {
      params: prepareFilter(params),
      signal,
    })
  );

/* =========================================================
   DEFAULTER LIST
========================================================= */

export const fetchDefaulters = async (params, { signal } = {}) =>
  unwrap(
    await apiClient.get(`${BASE}/list`, {
      params: prepareFilter(params),
      signal,
    })
  );

/* =========================================================
   DEFAULTER RETURN HISTORY
========================================================= */

/**
 * Return filing history for a GSTIN.
 * Backend: GET /gst/return-3b/defaulters/{gstin}/history?months=12
 *
 * @param {string} gstin
 * @param {{ months?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<Array>}
 */
export const fetchDefaulterHistory = async (
  gstin,
  { months = DEFAULT_MONTHS, signal } = {}
) => {
  const normalizedGstin = String(gstin || "").trim().toUpperCase();

  if (!normalizedGstin) {
    throw new DefaulterRequestError("GSTIN is required to fetch defaulter history.");
  }
  if (!GSTIN_RE.test(normalizedGstin)) {
    throw new DefaulterRequestError("GSTIN must be 15 letters/digits.");
  }

  const safeMonths = Math.min(
    Math.max(Math.trunc(Number(months)) || DEFAULT_MONTHS, 1),
    MAX_MONTHS
  );

  return unwrap(
    await apiClient.get(`${BASE}/${encodeURIComponent(normalizedGstin)}/history`, {
      params: { months: safeMonths },
      signal,
    })
  );
};

/* =========================================================
   CSV EXPORT
========================================================= */

/**
 * With responseType "blob", an error response body (the JSON problem detail) also arrives as a Blob, which
 * hides the real message. Parse it back so getApiErrorMessage can read it.
 */
const withParsedBlobError = async (err) => {
  const data = err?.response?.data;

  if (data instanceof Blob) {
    try {
      err.response.data = JSON.parse(await data.text());
    } catch {
      /* not JSON: leave it as is */
    }
  }

  return err;
};

/**
 * Downloads the filtered CSV into memory and returns it as a Blob.
 * Large exports are held in memory by the browser; for very large ones prefer a direct (authenticated) link.
 */
export const exportDefaultersCsv = async (params, { signal } = {}) => {
  const query = prepareFilter(params);

  try {
    const blob = unwrap(
      await apiClient.get(`${BASE}/export`, {
        params: query,
        responseType: "blob",
        timeout: EXPORT_TIMEOUT_MS,
        signal,
      })
    );

    if (!(blob instanceof Blob)) {
      throw new Error("Unexpected response while exporting defaulters.");
    }

    return blob;
  } catch (err) {
    throw await withParsedBlobError(err);
  }
};

/** Saves a Blob through a temporary link. */
export const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // revoke after the browser has started the download
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

/** Export + save in one call. The filename matches the one the server proposes. */
export const downloadDefaultersCsv = async (params, options = {}) => {
  const query = prepareFilter(params);
  const blob = await exportDefaultersCsv(query, options);

  saveBlob(blob, `gst-3b-defaulters-${query.retPeriod}.csv`);

  return blob;
};