import axios from "axios";
import { dashboardClient } from "./apiClient";

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

/**
 * Fetches paginated scrutiny records for high-risk taxpayers.
 *
 * @param {Object} options
 * @param {string} options.retPeriod - Return period filter (e.g., "032026")
 * @param {number} [options.page=0] - 0-indexed page number for Spring Boot backend
 * @param {number} [options.size=10] - Number of records per page
 * @param {string} [options.riskCategory] - Optional risk filter (e.g., "CRITICAL", "HIGH")
 * @param {AbortSignal} [options.signal] - AbortSignal for request cancellation
 * @returns {Promise<Object>} PagedAuditResponse object containing content array and pagination details
 */
export const fetchScrutinyPipeline = async ({
  retPeriod,
  page = 0,
  size = 10,
  riskCategory,
  signal,
} = {}) => {
  try {
    const params = {
      retPeriod,
      page,
      size,
      ...(riskCategory && riskCategory !== "ALL" && { riskCategory }),
    };

    const response = await dashboardClient.get("/gst/return-3b/scrutiny-pipeline", {
      params,
      signal,
    });

    return response.data;
  } catch (err) {
    if (axios.isCancel(err)) {
      return null;
    }
    console.error("Failed to fetch scrutiny pipeline records:", err);
    throw err;
  }
};

/**
 * Submits a Form GST ASMT-10 notice for a specific taxpayer and return period.
 *
 * @param {Object} payload
 * @param {string} payload.gstin - Target Taxpayer GSTIN
 * @param {string} payload.retPeriod - Target Return Period (e.g., "032026")
 * @param {string} payload.groundReason - Statutory scrutiny observation reason
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal] - AbortSignal for request cancellation
 * @returns {Promise<Object>} Response confirmation object from backend
 */
export const issueAsmt10Notice = async (
  { gstin, retPeriod, groundReason },
  { signal } = {}
) => {
  try {
    const response = await dashboardClient.post(
      "/gst/return-3b/issue-asmt10",
      { gstin, retPeriod, groundReason },
      { signal }
    );

    return response.data;
  } catch (err) {
    if (axios.isCancel(err)) {
      return null;
    }
    console.error("Failed to issue ASMT-10 notice:", err);
    throw err;
  }
};

/**
 * Fetches paginated GST return defaulter records for Form GST 3A / REG-17 processing.
 *
 * @param {Object} options
 * @param {string} options.retPeriod - Return period filter (e.g., "032026")
 * @param {number} [options.page=0] - 0-indexed page number
 * @param {number} [options.size=10] - Number of records per page
 * @param {string} [options.riskLevel] - Risk filter tier ("CRITICAL", "HIGH", "MEDIUM", "ALL")
 * @param {AbortSignal} [options.signal] - AbortSignal for request cancellation
 * @returns {Promise<Object>} PagedAuditResponse containing defaulter records and metadata
 */
export const fetchReturnDefaulters = async ({
  retPeriod,
  page = 0,
  size = 10,
  riskLevel,
  signal,
} = {}) => {
  try {
    const params = {
      retPeriod,
      page,
      size,
      ...(riskLevel && riskLevel !== "ALL" && { riskLevel }),
    };

    const response = await dashboardClient.get("/gst/return-3b/defaulters", {
      params,
      signal,
    });

    return response.data;
  } catch (err) {
    if (axios.isCancel(err)) {
      return null;
    }
    console.error("Failed to fetch return defaulter records:", err);
    throw err;
  }
};

/**
 * Issues statutory action (Form GST 3A Notice or REG-17 Order) to a non-filer GSTIN.
 *
 * @param {Object} payload
 * @param {string} payload.gstin - Target Taxpayer GSTIN
 * @param {string} payload.retPeriod - Target Return Period (e.g., "032026")
 * @param {string} payload.actionType - Action type required (e.g., "Form GST 3A", "REG-17 Notice")
 * @param {string} payload.groundReason - Statutory reason/grounds for action
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal] - AbortSignal for request cancellation
 * @returns {Promise<Object>} Dispatch confirmation response
 */
export const issueDefaulterNotice = async (
  { gstin, retPeriod, actionType, groundReason },
  { signal } = {}
) => {
  try {
    const response = await dashboardClient.post(
      "/gst/return-3b/issue-defaulter-action",
      { gstin, retPeriod, actionType, groundReason },
      { signal }
    );

    return response.data;
  } catch (err) {
    if (axios.isCancel(err)) {
      return null;
    }
    console.error("Failed to issue defaulter statutory notice:", err);
    throw err;
  }
};

/**
 * Triggers cache eviction for non-filer and defaulter analytics pipelines.
 *
 * @param {Object} options
 * @param {AbortSignal} [options.signal] - AbortSignal for request cancellation
 * @returns {Promise<boolean>} True if cache eviction request succeeded (202 or 200)
 */
export const refreshDefaulterCache = async ({ signal } = {}) => {
  try {
    const response = await dashboardClient.post(
      "/gst/return-3b/defaulters/refresh-cache",
      {},
      { signal }
    );
    return response.status === 202 || response.status === 200;
  } catch (err) {
    if (axios.isCancel(err)) {
      return false;
    }
    console.error("Failed to refresh defaulters cache:", err);
    throw err;
  }
};

/**
 * Fetches monthly GSTR-3B revenue breakdown summary with optional period filtering and cancellation.
 *
 * @param {Object} options
 * @param {Array<string>} [options.periods=[]] - Optional list of return periods (e.g., ["032026", "022026"])
 * @param {AbortSignal} [options.signal] - AbortSignal for request cancellation
 * @returns {Promise<Array<Object>>} Array of monthly revenue summary objects
 */
// Fetch Financial Year list for the dropdown: GET /fin-year
export const fetchFinancialYears = async (signal) => {
  try {
    const response = await dashboardClient.get("/gst/return-3b/fin-year", { signal });
    // Returns array of strings e.g. ["2025-26", "2024-25"]
    return response.data || [];
  } catch (err) {
    if (axios.isCancel(err)) return null;
    console.error("Failed to fetch financial years:", err);
    return [];
  }
};

// Fetch Monthly Summary filtered by string Financial Year
export const fetchMonthlyRevenueSummary = async (finYear, signal) => {
  try {
    const params = {
      ...(finYear && finYear !== "ALL" && { finYear }), // Sends ?finYear=2025-26
    };

    const response = await dashboardClient.get("/gst/return-3b/monthly-summary", {
      params,
      signal,
    });

    return response.data;
  } catch (err) {
    if (axios.isCancel(err)) {
      return null;
    }
    console.error("Failed to fetch GSTR-3B monthly revenue summary:", err);
    throw err;
  }
};

export const fetchAllReturnPeriods = async ({ signal } = {}) => {
  try {
    const response = await dashboardClient.get("/gst/return-3b/periods", {
      signal,
    });
    return response.data;
  } catch (err) {
    if (axios.isCancel(err)) {
      return [];
    }
    console.error("Failed to fetch GST return periods:", err);
    throw err;
  }
};
