import axios from "axios";

/**
 * Central Axios client.
 *
 * Development (.env.development):
 * VITE_API_BASE=http://localhost:8087/api
 *
 * Production behind Nginx (.env.production):
 * VITE_API_BASE=/api
 */

const API_BASE_URL =
  import.meta.env.VITE_API_BASE?.trim() || "/api";

/**
 * Default API timeout.
 *
 * GST analytics / Oracle aggregation queries can take longer
 * than normal CRUD APIs, therefore 120 seconds is used.
 */
const DEFAULT_TIMEOUT = 120000;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,

  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },

  withCredentials: false,

  timeout: DEFAULT_TIMEOUT,
});

/* =========================================================
   REQUEST INTERCEPTOR
========================================================= */

apiClient.interceptors.request.use(
  (config) => {
    /*
     * Authentication can be enabled here when required.
     *
     * const token = localStorage.getItem("accessToken");
     *
     * if (token) {
     *   config.headers.Authorization = `Bearer ${token}`;
     * }
     */

    return config;
  },

  (error) => Promise.reject(error)
);

/* =========================================================
   RESPONSE INTERCEPTOR
========================================================= */

apiClient.interceptors.response.use(
  /**
   * IMPORTANT:
   *
   * This client returns response.data directly.
   *
   * Correct:
   *
   * const data = await apiClient.get("/endpoint");
   *
   * Do NOT use:
   *
   * const response = await apiClient.get("/endpoint");
   * return response.data;
   */
  (response) => response.data,

  (error) => {
    /* -----------------------------------------------------
       REQUEST CANCELLED
    ----------------------------------------------------- */

    /*
     * Preserve Axios cancellation errors so existing code:
     *
     * axios.isCancel(error)
     *
     * continues to work.
     */
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    const status = error.response?.status;

    /* -----------------------------------------------------
       CLIENT-SIDE TIMEOUT
    ----------------------------------------------------- */

    if (
      error.code === "ECONNABORTED" ||
      error.code === "ETIMEDOUT"
    ) {
      console.error("API request timed out", {
        method: error.config?.method?.toUpperCase(),
        baseURL: error.config?.baseURL,
        url: error.config?.url,
        timeout: error.config?.timeout,
      });

      const timeoutError = new Error(
        "The server is taking longer than expected to process the request. Please try again."
      );

      timeoutError.name = "ApiTimeoutError";
      timeoutError.code = error.code;
      timeoutError.status = 408;
      timeoutError.isTimeout = true;
      timeoutError.data = error.response?.data;
      timeoutError.originalError = error;

      return Promise.reject(timeoutError);
    }

    /* -----------------------------------------------------
       NETWORK ERROR
    ----------------------------------------------------- */

    if (error.code === "ERR_NETWORK" || !error.response) {
      console.error("API network error", {
        method: error.config?.method?.toUpperCase(),
        baseURL: error.config?.baseURL,
        url: error.config?.url,
        message: error.message,
      });

      const networkError = new Error(
        "Unable to connect to the server. Please verify the backend service and network connection."
      );

      networkError.name = "ApiNetworkError";
      networkError.code = error.code || "ERR_NETWORK";
      networkError.status = 0;
      networkError.isNetworkError = true;
      networkError.originalError = error;

      return Promise.reject(networkError);
    }

    /* -----------------------------------------------------
       HTTP ERRORS
    ----------------------------------------------------- */

    let message;

    switch (status) {
      case 400:
        message =
          error.response?.data?.message ||
          error.response?.data?.error ||
          "Invalid request.";
        break;

      case 401:
        message =
          error.response?.data?.message ||
          "Your session has expired. Please sign in again.";
        break;

      case 403:
        message =
          error.response?.data?.message ||
          "You are not authorized to perform this operation.";
        break;

      case 404:
        message =
          error.response?.data?.message ||
          "The requested resource was not found.";
        break;

      case 408:
        message =
          error.response?.data?.message ||
          "The server timed out while processing the request.";
        break;

      case 429:
        message =
          error.response?.data?.message ||
          "Too many requests. Please wait and try again.";
        break;

      case 500:
        message =
          error.response?.data?.message ||
          error.response?.data?.error ||
          "An internal server error occurred.";
        break;

      case 502:
        message =
          error.response?.data?.message ||
          "The backend service is temporarily unavailable.";
        break;

      case 503:
        message =
          error.response?.data?.message ||
          "The service is temporarily unavailable.";
        break;

      case 504:
        message =
          error.response?.data?.message ||
          "The server took too long to complete the request.";
        break;

      default:
        message =
          error.response?.data?.message ||
          error.response?.data?.error ||
          error.message ||
          `Request failed (${status || "Unknown Error"}).`;
    }

    /* -----------------------------------------------------
       CREATE APPLICATION ERROR
    ----------------------------------------------------- */

    const customError = new Error(message);

    customError.name = "ApiError";
    customError.code = error.code;
    customError.status = status;
    customError.data = error.response?.data;
    customError.originalError = error;

    return Promise.reject(customError);
  }
);

export default apiClient;