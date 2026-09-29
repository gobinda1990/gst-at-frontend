import { apiClient } from "./apiClient";

const BASE = "/gst/return-3b/defaulters";


const cleanParams = (params = {}) =>
  Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) =>
        value !== undefined &&
        value !== null &&
        value !== ""
    )
  );

/*
 * This service assumes your existing apiClient interceptor returns
 * response.data.
 *
 * If apiClient returns AxiosResponse instead, change each method
 * to return response.data.
 */

/* =========================================================
   RETURN PERIODS
========================================================= */

export const fetchDefaulterPeriods = async ({ signal } = {}) => {
  return apiClient.get(`${BASE}/periods`, {
    signal,
  });
};

/* =========================================================
   OFFICES
========================================================= */

export const fetchDefaulterOffices = async (
  retPeriod,
  { signal } = {}
) => {
  return apiClient.get(`${BASE}/offices`, {
    params: {
      retPeriod,
    },
    signal,
  });
};

/* =========================================================
   SUMMARY
========================================================= */

export const fetchDefaulterSummary = async (
  params,
  { signal } = {}
) => {
  return apiClient.get(`${BASE}/summary`, {
    params: cleanParams(params),
    signal,
  });
};

/* =========================================================
   DEFAULTER LIST
========================================================= */

export const fetchDefaulters = async (
  params,
  { signal } = {}
) => {
  return apiClient.get(`${BASE}/list`, {
    params: cleanParams(params),
    signal,
  });
};

/* =========================================================
   DEFAULTER RETURN HISTORY
========================================================= */

/**
 * Fetch return filing history for a GSTIN.
 *
 * Backend:
 * GET /gst/return-3b/defaulters/{gstin}/history?months=12
 *
 * @param {string} gstin
 * @param {Object} options
 * @param {number} [options.months=12]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Array>}
 */
export const fetchDefaulterHistory = async (
  gstin,
  {
    months = 12,
    signal,
  } = {}
) => {
  const normalizedGstin = String(gstin || "")
    .trim()
    .toUpperCase();

  if (!normalizedGstin) {
    throw new Error(
      "GSTIN is required to fetch defaulter history."
    );
  }

  return apiClient.get(
    `${BASE}/${encodeURIComponent(
      normalizedGstin
    )}/history`,
    {
      params: cleanParams({
        months,
      }),
      signal,
    }
  );
};

/* =========================================================
   CSV EXPORT
========================================================= */

export const exportDefaultersCsv = async (params) => {
  return apiClient.get(`${BASE}/export`, {
    params: cleanParams(params),
    responseType: "blob",
  });
};