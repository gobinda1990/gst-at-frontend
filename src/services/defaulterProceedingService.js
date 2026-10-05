import axios from "axios";
import { apiClient } from "./apiClient";

const BASE = "/gst/return-3b/defaulters/proceedings";

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

export async function fetchProceedingSummary(params = {}, options = {}) {
  const response = await apiClient.get(`${BASE}/summary`, {
    params,
    signal: options.signal,
  });
  return unwrap(response);
}

export async function fetchProceedings(params = {}, options = {}) {
  const response = await apiClient.get(BASE, {
    params,
    signal: options.signal,
  });
  return unwrap(response);
}

export async function fetchProceeding(id, options = {}) {
  const response = await apiClient.get(`${BASE}/${id}`, {
    signal: options.signal,
  });
  return unwrap(response);
}

export async function fetchProceedingAudit(id, options = {}) {
  const response = await apiClient.get(`${BASE}/${id}/audit`, {
    signal: options.signal,
  });
  return unwrap(response);
}

export async function issueGstr3a(payload) {
  const response = await apiClient.post(`${BASE}/gstr3a`, payload);
  return unwrap(response);
}

export async function scanSection62() {
  const response = await apiClient.post(`${BASE}/section62/scan`);
  return unwrap(response);
}

export async function issueAsmt13(payload) {
  const response = await apiClient.post(`${BASE}/asmt13`, payload);
  return unwrap(response);
}

export async function reconcileProceeding(proceedingId) {
  const response = await apiClient.post(`${BASE}/${proceedingId}/reconcile`);
  return unwrap(response);
}
