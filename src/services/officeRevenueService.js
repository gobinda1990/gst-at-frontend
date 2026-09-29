import { apiClient } from "./apiClient";

const BASE = "/gst/return-3b/office-revenue";

const unwrap = (r) => r?.data ?? r;

// Drop empty values so the backend never sees office="" or growthStatus="".
const clean = (params = {}) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== "" && v != null)
  );

const get = (path, params, signal) =>
  apiClient.get(`${BASE}${path}`, { params: clean(params), signal }).then(unwrap);

// The UI works with `period`; the API expects `retPeriod`. `signal` must never reach the query string.
const filterParams = ({ period, retPeriod, office, growthStatus, search } = {}) => ({
  retPeriod: retPeriod ?? period,
  office,
  growthStatus,
  search,
});

export const fetchOfficeRevenuePeriods = ({ signal } = {}) =>
  get("/periods", undefined, signal);

export const fetchOfficeRevenueOffices = ({ period, retPeriod, signal } = {}) =>
  get("/offices", { retPeriod: retPeriod ?? period }, signal);

export const fetchOfficeRevenueSummary = ({ signal, ...filters } = {}) =>
  get("/summary", filterParams(filters), signal);

export const fetchOfficeRevenueList = ({ signal, page, size, ...filters } = {}) =>
  get("/list", { ...filterParams(filters), page, size }, signal);

export const fetchOfficeRevenueTrend = ({ signal, period, retPeriod, office, months } = {}) =>
  get("/trend", { retPeriod: retPeriod ?? period, office, months }, signal);

export const runOfficeRevenueBatch = ({ period, retPeriod, signal } = {}) =>
  apiClient
    .post(`${BASE}/batch/run`, null, { params: { retPeriod: retPeriod ?? period }, signal })
    .then(unwrap);

export async function exportOfficeRevenue({ signal, ...filters } = {}) {
  const params = filterParams(filters);
  let res;
  try {
    res = await apiClient.get(`${BASE}/export`, {
      params: clean(params),
      responseType: "blob",
      headers: { Accept: "text/csv" },
      signal,
    });
  } catch (err) {
    // With responseType "blob" an error body arrives as a Blob; decode it so err.response.data.message works.
    const body = err?.response?.data;
    if (body instanceof Blob) {
      try {
        err.response.data = JSON.parse(await body.text());
      } catch {
        /* not JSON, keep the original error */
      }
    }
    throw err;
  }

  const blob = res?.data ?? res;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gst-3b-office-revenue-${params.retPeriod}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}