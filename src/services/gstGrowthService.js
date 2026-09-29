import axios from "axios";

import { apiClient } from "./apiClient";

/* =========================================================
   CONFIGURATION
========================================================= */

const BASE_URL = "/gst/return-3b/growth";

const PERIOD_PATTERN = /^(0[1-9]|1[0-2])\d{4}$/;

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

/* =========================================================
   HELPERS
========================================================= */

/**
 * apiClient response interceptor is expected to return:
 *
 * response.data
 *
 * Therefore all functions in this file work directly with
 * the parsed response body and MUST NOT use result.data.
 */

const isCancelled = (error) =>
  axios.isCancel(error) ||
  error?.code === "ERR_CANCELED" ||
  error?.name === "CanceledError" ||
  error?.name === "AbortError";

/**
 * Convert blank string values to undefined.
 *
 * Axios will then omit them from the query string.
 */
const optionalParam = (value) => {
  if (value === null || value === undefined) {
    return undefined;
  }

  const normalized = String(value).trim();

  return normalized || undefined;
};

/**
 * Validate MMYYYY return period.
 */
const validatePeriod = (period) => {
  const normalized = String(period || "").trim();

  if (!PERIOD_PATTERN.test(normalized)) {
    throw new Error(
      "Invalid GST return period. Expected MMYYYY format."
    );
  }

  return normalized;
};

/**
 * Normalize page number.
 */
const normalizePage = (page) => {
  const value = Number(page);

  if (!Number.isInteger(value) || value < 0) {
    return 0;
  }

  return value;
};

/**
 * Normalize page size and protect backend from excessively
 * large requests.
 */
const normalizeSize = (size) => {
  const value = Number(size);

  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(value, MAX_PAGE_SIZE);
};

/**
 * Common filter parameter builder.
 */
const buildFilterParams = ({
  period,
  office,
  search,
  trend,
  riskLevel,
} = {}) => ({
  period: validatePeriod(period),

  office: optionalParam(office),

  search: optionalParam(search),

  trend: optionalParam(trend),

  riskLevel: optionalParam(riskLevel),
});

/**
 * Extract a useful error message for the UI.
 */
export const getGrowthApiErrorMessage = (
  error,
  fallback = "Unable to process GST growth request."
) => {
  if (isCancelled(error)) {
    return "";
  }

  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
};

/* =========================================================
   RETURN PERIODS
========================================================= */

/**
 * Fetch all return periods available for growth analytics.
 *
 * Expected:
 *
 * [
 *   {
 *     value: "082026",
 *     label: "August 2026"
 *   }
 * ]
 */
export const fetchGrowthPeriods = async (
  { signal } = {}
) => {
  try {
    const result = await apiClient.get(
      `${BASE_URL}/periods`,
      {
        signal,
      }
    );

    if (!Array.isArray(result)) {
      return [];
    }

    /*
     * Defensive filtering:
     * prevents malformed backend rows from breaking
     * <select>.map().
     */
    return result.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        PERIOD_PATTERN.test(
          String(item.value || "").trim()
        )
    );
  } catch (error) {
    if (isCancelled(error)) {
      return [];
    }

    throw error;
  }
};

/* =========================================================
   OFFICES
========================================================= */

/**
 * Fetch jurisdiction/office options available for the
 * selected return period.
 */
export const fetchGrowthOffices = async (
  period,
  { signal } = {}
) => {
  const normalizedPeriod =
    validatePeriod(period);

  try {
    const result = await apiClient.get(
      `${BASE_URL}/offices`,
      {
        params: {
          period: normalizedPeriod,
        },

        signal,
      }
    );

    return Array.isArray(result)
      ? result.filter(
          (item) =>
            item &&
            typeof item === "object" &&
            item.value !== undefined &&
            item.value !== null
        )
      : [];
  } catch (error) {
    if (isCancelled(error)) {
      return [];
    }

    throw error;
  }
};

/* =========================================================
   SUMMARY / KPI
========================================================= */

/**
 * Fetch KPI summary.
 */
export const fetchGrowthSummary = async (
  {
    period,
    office,
  },
  { signal } = {}
) => {
  const params = buildFilterParams({
    period,
    office,
  });

  try {
    const result = await apiClient.get(
      `${BASE_URL}/summary`,
      {
        params,
        signal,
      }
    );

    /*
     * Keep undefined for cancelled/invalid empty response.
     * Component already has EMPTY_SUMMARY fallback.
     */
    return result &&
      typeof result === "object" &&
      !Array.isArray(result)
      ? result
      : undefined;
  } catch (error) {
    if (isCancelled(error)) {
      return undefined;
    }

    throw error;
  }
};

/* =========================================================
   TREND / CHART
========================================================= */

/**
 * Fetch historical trend information used by Recharts.
 */
export const fetchGrowthTrend = async (
  {
    period,
    office,
  },
  { signal } = {}
) => {
  const params = buildFilterParams({
    period,
    office,
  });

  try {
    const result = await apiClient.get(
      `${BASE_URL}/trend`,
      {
        params,
        signal,
      }
    );

    return Array.isArray(result)
      ? result
      : [];
  } catch (error) {
    if (isCancelled(error)) {
      return [];
    }

    throw error;
  }
};

/* =========================================================
   TAXPAYER TABLE
========================================================= */

/**
 * Fetch server-side paginated taxpayer growth records.
 *
 * Backend endpoint:
 *
 * GET /gst/return-3b/growth/taxpayers
 */
export const fetchGrowthTaxpayers = async (
  {
    period,

    office,

    search,

    trend,

    riskLevel,

    page = 0,

    size = DEFAULT_PAGE_SIZE,
  },

  { signal } = {}
) => {
  const params = {
    ...buildFilterParams({
      period,
      office,
      search,
      trend,
      riskLevel,
    }),

    page: normalizePage(page),

    size: normalizeSize(size),
  };

  try {
    const result = await apiClient.get(
      `${BASE_URL}/taxpayers`,
      {
        params,
        signal,
      }
    );

    /*
     * Defensive page normalization.
     *
     * Prevents:
     *
     * Cannot read properties of undefined (reading 'map')
     *
     * if the backend unexpectedly returns null.
     */
    if (
      !result ||
      typeof result !== "object" ||
      Array.isArray(result)
    ) {
      return {
        content: [],
        totalElements: 0,
        totalPages: 0,
        page: params.page,
        size: params.size,
        first: true,
        last: true,
      };
    }

    return {
      ...result,

      content: Array.isArray(result.content)
        ? result.content
        : [],

      totalElements:
        Number(result.totalElements) || 0,

      totalPages:
        Number(result.totalPages) || 0,

      page:
        Number.isInteger(Number(result.page))
          ? Number(result.page)
          : params.page,

      size:
        Number.isInteger(Number(result.size))
          ? Number(result.size)
          : params.size,

      first:
        typeof result.first === "boolean"
          ? result.first
          : params.page === 0,

      last:
        typeof result.last === "boolean"
          ? result.last
          : false,
    };
  } catch (error) {
    if (isCancelled(error)) {
      return undefined;
    }

    throw error;
  }
};

/* =========================================================
   CSV EXPORT
========================================================= */

/**
 * Fetch filtered growth analytics as CSV.
 *
 * IMPORTANT:
 *
 * apiClient interceptor returns response.data.
 *
 * Because responseType = "blob", the resolved result is
 * expected to be the Blob itself.
 */
export const exportGrowthCsv = async (
  {
    period,

    office,

    search,

    trend,

    riskLevel,
  },

  { signal } = {}
) => {
  const params = buildFilterParams({
    period,
    office,
    search,
    trend,
    riskLevel,
  });

  try {
    const result = await apiClient.get(
      `${BASE_URL}/export`,
      {
        params,

        /*
         * Axios must treat successful CSV output as a Blob.
         */
        responseType: "blob",

        /*
         * Accept CSV for successful requests.
         *
         * application/json is also accepted so the backend
         * can still return a structured application error.
         */
        headers: {
          Accept:
            "text/csv, application/json",
        },

        /*
         * Government-office exports may legitimately
         * take longer than normal dashboard requests.
         *
         * Backend/proxy/database timeouts should still
         * provide infrastructure-level protection.
         */
        timeout: 0,

        signal,
      }
    );

    /*
     * Normal path:
     *
     * apiClient interceptor returns response.data,
     * therefore result should already be a Blob.
     */
    if (result instanceof Blob) {
      /*
       * responseType="blob" means a JSON error body may
       * also be represented as a Blob.
       *
       * Detect that case before starting the download.
       */
      const contentType =
        String(result.type || "")
          .toLowerCase();

      if (
        contentType.includes(
          "application/json"
        ) ||
        contentType.includes(
          "application/problem+json"
        )
      ) {
        const text =
          await result.text();

        let message =
          "Unable to export GST growth report.";

        if (text?.trim()) {
          try {
            const body =
              JSON.parse(text);

            message =
              body?.message ||
              body?.detail ||
              body?.error ||
              message;
          } catch {
            message =
              text.trim();
          }
        }

        throw new Error(message);
      }

      return result;
    }

    /*
     * Defensive fallback:
     *
     * Protect against an interceptor, test mock,
     * or alternate adapter returning raw CSV.
     */
    if (
      typeof result === "string" ||
      result instanceof ArrayBuffer
    ) {
      return new Blob(
        [result],
        {
          type: "text/csv;charset=utf-8",
        }
      );
    }

    throw new Error(
      "The server returned an invalid CSV export response."
    );
  } catch (error) {
    if (isCancelled(error)) {
      return undefined;
    }

    throw error;
  }
};

/* =========================================================
   DOWNLOAD CSV
========================================================= */

/**
 * Complete browser-side CSV download helper.
 *
 * IMPORTANT:
 *
 * This method DOES NOT call the backend directly.
 *
 * exportGrowthCsv() already performs the HTTP request and
 * returns the CSV Blob.
 *
 * This method is responsible only for starting the browser
 * download.
 */
export const downloadGrowthCsv = async (
  filters,
  { signal } = {}
) => {
  const period =
    validatePeriod(filters?.period);

  /*
   * Reuse the existing export function.
   *
   * Do not duplicate the Axios request here.
   */
  const blob =
    await exportGrowthCsv(
      filters,
      {
        signal,
      }
    );

  /*
   * Request was cancelled.
   */
  if (!blob) {
    return false;
  }

  /*
   * Defensive validation.
   */
  if (!(blob instanceof Blob)) {
    throw new Error(
      "GST growth export did not return a valid CSV Blob."
    );
  }

  const url =
    window.URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  try {
    anchor.href = url;

    /*
     * apiClient strips Axios response headers, therefore
     * Content-Disposition is unavailable here.
     *
     * Generate the deterministic filename client-side.
     */
    anchor.download =
      `gst-3b-growth-${period}.csv`;

    anchor.style.display = "none";

    document.body.appendChild(anchor);

    anchor.click();

    return true;
  } finally {
    anchor.remove();

    /*
     * Delay revocation slightly so browsers have enough
     * time to start processing the Blob URL.
     */
    window.setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 1000);
  }
};

/* =========================================================
   OPTIONAL COMBINED DASHBOARD FETCH
========================================================= */

/**
 * Fetch the three main dashboard datasets concurrently.
 *
 * Useful when GstReturn3bGrowth.jsx refreshes the entire
 * dashboard.
 */
export const fetchGrowthDashboard = async (
  {
    period,

    office,

    search,

    trend,

    riskLevel,

    page = 0,

    size = DEFAULT_PAGE_SIZE,
  },

  { signal } = {}
) => {
  const [
    summary,
    trendData,
    taxpayers,
  ] = await Promise.all([
    fetchGrowthSummary(
      {
        period,
        office,
      },
      {
        signal,
      }
    ),

    fetchGrowthTrend(
      {
        period,
        office,
      },
      {
        signal,
      }
    ),

    fetchGrowthTaxpayers(
      {
        period,
        office,
        search,
        trend,
        riskLevel,
        page,
        size,
      },
      {
        signal,
      }
    ),
  ]);

  return {
    summary,

    trend:
      Array.isArray(trendData)
        ? trendData
        : [],

    taxpayers,
  };
};