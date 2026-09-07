import axios from "axios";
import { dashboardClient } from "./apiClient";

/**
 * Fetches all available return periods stored in the database.
 * Useful for populating the period selection dropdown dynamically.
 *
 * @param {Object} options
 * @param {AbortSignal} [options.signal] - AbortSignal for request cancellation
 * @returns {Promise<Array<{ label: string, value: string }>>} List of return periods
 */
export const fetchAllReturnPeriods = async ({ signal } = {}) => {
  try {
    const response = await dashboardClient.get("/gst/return-3b/periods", {
      signal,
    });
    return response.data; // Expected format: [{ value: "062026", label: "June 2026" }, ...]
  } catch (err) {
    if (axios.isCancel(err)) {
      return [];
    }
    console.error("Failed to fetch GST return periods:", err);
    throw err;
  }
};

/**
 * Fetches detailed GST risk & anomaly summary records filtered by return period.
 *
 * @param {Object} options
 * @param {string} options.retPeriod - Required return period (e.g., "062026")
 * @param {string} [options.gstin] - Optional GSTIN search term
 * @param {AbortSignal} [options.signal] - AbortSignal for request cancellation
 */
export const fetchGstRiskSummary = async ({ retPeriod, gstin, signal } = {}) => {
  try {
    const params = {
      retPeriod,
      ...(gstin && { gstin }),
    };

    const response = await dashboardClient.get("/gst/return-3b/summary", {
      params,
      signal,
    });

    return response.data;
  } catch (err) {
    if (axios.isCancel(err)) {
      return null;
    }
    console.error(`Failed to fetch GST risk summary for period ${retPeriod}:`, err);
    throw err;
  }
};

/**
 * Fetches GST dashboard metrics with optional filtering and cancellation support.
 *
 * @param {Object} options
 * @param {string} [options.retPeriod] - Return period filter (e.g., "032026")
 * @param {string} [options.stateCode] - State jurisdiction code (e.g., "27")
 * @param {boolean} [options.forceRefresh=false] - Bypass backend cache
 * @param {AbortSignal} [options.signal] - AbortSignal for request cancellation
 */
export const fetchDashboardMetrics = async ({
  retPeriod,
  stateCode,
  forceRefresh = false,
  signal,
} = {}) => {
  try {
    const params = {
      ...(retPeriod && { retPeriod }),
      ...(stateCode && { stateCode }),
      forceRefresh,
    };

    const response = await dashboardClient.get("/gst/return-3b/metrics", {
      params,
      signal,
    });

    return response.data;
  } catch (err) {
    // Silence intentional aborts from component unmount / re-render
    if (axios.isCancel(err)) {
      return null;
    }
    console.error("Failed to fetch GST dashboard metrics:", err);
    throw err;
  }
};

/**
 * Triggers backend cache eviction and rebuilds analytics data.
 *
 * @param {Object} options
 * @param {AbortSignal} [options.signal] - AbortSignal for request cancellation
 * @returns {Promise<boolean>} True if cache refresh request was accepted (202)
 */
export const refreshDashboardCache = async ({ signal } = {}) => {
  try {
    const response = await dashboardClient.post(
      "/gst/return-3b/refresh-cache",
      {},
      { signal }
    );
    return response.status === 202;
  } catch (err) {
    if (axios.isCancel(err)) {
      return false;
    }
    console.error("Failed to clear backend analytics cache:", err);
    throw err;
  }
};