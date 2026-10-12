
import axios from "axios";
import { apiClient } from "./apiClient";

const BASE = "/gst/return-3b/defaulters/proceedings";


/*
 * apiClient may already return response.data through
 * its response interceptor.
 */
const unwrap = (response) => response?.data ?? response;

export const apiMessage = (error, fallback = "Request failed.") =>
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  error?.message ||
  fallback;

export const isAbortError = (error) =>
  axios.isCancel(error) ||
  error?.name === "CanceledError" ||
  error?.name === "AbortError" ||
  error?.code === "ERR_CANCELED";

/* =========================================================
   DYNAMIC RETURN PERIODS
========================================================= */

export async function fetchProceedingPeriods(options = {}) {
  const response = await apiClient.get(`${BASE}/periods`, {
    signal: options.signal,
  });

  const result = unwrap(response);

  const records = Array.isArray(result)
    ? result
    : Array.isArray(result?.content)
      ? result.content
      : Array.isArray(result?.periods)
        ? result.periods
        : [];

  const monthFormatter = new Intl.DateTimeFormat("en-IN", {
    month: "long",
  });

  const periods = records
    .map((item) => {
      const value = String(
        typeof item === "string" || typeof item === "number"
          ? item
          : item?.value ?? item?.retPeriod ?? item?.period ?? ""
      ).trim();

      if (!/^(0[1-9]|1[0-2])\d{4}$/.test(value)) {
        return null;
      }

      const month = Number(value.substring(0, 2));
      const year = Number(value.substring(2, 6));

      const label =
        typeof item === "object" && item?.label
          ? item.label
          : `${monthFormatter.format(new Date(year, month - 1, 1))} ${year}`;

      return {
        value,
        label,
      };
    })
    .filter(Boolean);

  return Array.from(
    new Map(periods.map((item) => [item.value, item])).values()
  ).sort((a, b) => {
    const aKey = Number(a.value.substring(2) + a.value.substring(0, 2));
    const bKey = Number(b.value.substring(2) + b.value.substring(0, 2));

    return bKey - aKey;
  });
}

/* =========================================================
   PROCEEDING SUMMARY
========================================================= */

export async function fetchProceedingSummary(params = {}, options = {}) {
  const response = await apiClient.get(`${BASE}/summary`, {
    params,
    signal: options.signal,
  });

  return unwrap(response);
}

/* =========================================================
   PAGINATED PROCEEDINGS
========================================================= */

export async function fetchProceedings(params = {}, options = {}) {
  const response = await apiClient.get(BASE, {
    params,
    signal: options.signal,
  });

  return unwrap(response);
}

/* =========================================================
   PROCEEDING DETAILS
========================================================= */

export async function fetchProceeding(id, options = {}) {
  const response = await apiClient.get(`${BASE}/${id}`, {
    signal: options.signal,
  });

  return unwrap(response);
}

/* =========================================================
   PROCEEDING AUDIT HISTORY
========================================================= */

export async function fetchProceedingAudit(id, options = {}) {
  const response = await apiClient.get(`${BASE}/${id}/audit`, {
    signal: options.signal,
  });

  return unwrap(response);
}

/* =========================================================
   ISSUE GSTR-3A
========================================================= */

export async function issueGstr3a(payload) {
  const response = await apiClient.post(`${BASE}/gstr3a`, payload);

  return unwrap(response);
}

/* =========================================================
   SECTION 62 ELIGIBILITY SCAN
========================================================= */

export async function scanSection62() {
  const response = await apiClient.post(`${BASE}/section62/scan`);

  return unwrap(response);
}

/* =========================================================
   ISSUE ASMT-13
========================================================= */

export async function issueAsmt13(payload) {
  const response = await apiClient.post(`${BASE}/asmt13`, payload);

  return unwrap(response);
}

/* =========================================================
   RECONCILE PROCEEDING
========================================================= */

export async function reconcileProceeding(proceedingId) {
  const response = await apiClient.post(
    `${BASE}/${proceedingId}/reconcile`
  );

  return unwrap(response);
}
