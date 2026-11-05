import axios from "axios";

/**
 * =========================================================
 * CENTRAL AXIOS API CLIENT
 * =========================================================
 *
 * Development:
 * VITE_API_BASE=http://localhost:8087/api
 *
 * Production:
 * VITE_API_BASE=/api
 *
 * Authentication:
 *  - Access token: localStorage
 *  - Refresh token: HttpOnly cookie (refresh_token)
 *
 * Backend refresh endpoint:
 * POST /api/v1/auth/refresh-token
 */

const API_BASE_URL =import.meta.env.VITE_API_BASE?.trim() ||"/api";

const DEFAULT_TIMEOUT = 120000;
const REFRESH_TIMEOUT = 30000;

const ACCESS_TOKEN_KEY = "accessToken";

const REFRESH_ENDPOINT = "http://10.153.43.8:8081/api/auth/refresh-token";
const LOGIN_ENDPOINT = "http://10.153.43.8:8081/api/auth/login";

const LOGIN_PAGE = "/login";

/* =========================================================
   MAIN AXIOS INSTANCE
========================================================= */

export const apiClient = axios.create({
  baseURL: API_BASE_URL,

  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },

  withCredentials: true,
  timeout: DEFAULT_TIMEOUT,
});

/* =========================================================
   REFRESH AXIOS INSTANCE
========================================================= */

/**
 * Separate instance prevents refresh request from
 * triggering the main 401 response interceptor.
 */
const refreshClient = axios.create({
  baseURL: API_BASE_URL,

  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },

  withCredentials: true,
  timeout: REFRESH_TIMEOUT,
});

/* =========================================================
   SHARED REFRESH PROMISE
========================================================= */

/**
 * Ensures only ONE refresh API request executes
 * when multiple API requests return HTTP 401.
 */
let refreshPromise = null;

/* =========================================================
   AUTHENTICATION UTILITIES
========================================================= */

function getAccessToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function saveAccessToken(accessToken) {
  if (!accessToken) {
    throw new Error("Access token is missing in refresh response.");
  }

  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
}

function clearAuthentication() {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(ACCESS_TOKEN_KEY);

  // Refresh token is HttpOnly.
  // JavaScript cannot read or remove it.
  // Backend must clear it using Set-Cookie.
}

function redirectToLogin() {
  if (
    typeof window !== "undefined" &&
    window.location.pathname !== LOGIN_PAGE
  ) {
    window.location.replace(LOGIN_PAGE);
  }
}

/* =========================================================
   REFRESH ACCESS TOKEN
========================================================= */

/**
 * Calls Spring Boot refresh API.
 *
 * Backend:
 * POST /api/v1/auth/refresh-token
 *
 * Refresh token:
 * HttpOnly cookie: refresh_token
 *
 * Expected response:
 *
 * {
 *   "status": 200,
 *   "message": "Token refreshed successfully",
 *   "data": {
 *     "accessToken": "new-access-token"
 *   }
 * }
 */
async function refreshAccessToken() {

  const response = await refreshClient.post(
    REFRESH_ENDPOINT,
    {},
    {
      withCredentials: true,
    }
  );

  const apiResponse = response.data;

  // ApiResponse<AuthResponse>
  const authResponse = apiResponse?.data;

  const newAccessToken = authResponse?.accessToken;

  if (!newAccessToken) {
    throw new Error(
      apiResponse?.message ||
      "Unable to retrieve a new access token."
    );
  }

  saveAccessToken(newAccessToken);

  return newAccessToken;
}

/* =========================================================
   REQUEST INTERCEPTOR
========================================================= */

apiClient.interceptors.request.use(

  (config) => {

    const token = getAccessToken();

    if (token) {
      config.headers.set
        ? config.headers.set(
            "Authorization",
            `Bearer ${token}`
          )
        : (config.headers.Authorization =
            `Bearer ${token}`);
    }

    return config;
  },

  (error) => Promise.reject(error)
);

/* =========================================================
   RESPONSE INTERCEPTOR
========================================================= */

apiClient.interceptors.response.use(

  /**
   * Return response.data directly.
   *
   * Usage:
   * const data = await apiClient.get("/endpoint");
   */
  (response) => response.data,

  async (error) => {

    /* -----------------------------------------------
       REQUEST CANCELLED
    ----------------------------------------------- */

    if (
      axios.isCancel(error) ||
      error.code === "ERR_CANCELED"
    ) {
      return Promise.reject(error);
    }

    const originalRequest = error.config;
    const status = error.response?.status;

    /* -----------------------------------------------
       AUTOMATIC TOKEN REFRESH
    ----------------------------------------------- */

    const requestUrl = originalRequest?.url || "";

    const isAuthenticationRequest =
      requestUrl.includes(REFRESH_ENDPOINT) ||
      requestUrl.includes(LOGIN_ENDPOINT);

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthenticationRequest
    ) {

      originalRequest._retry = true;

      try {

        /**
         * Concurrent requests share the same promise.
         */
        if (!refreshPromise) {

          refreshPromise = refreshAccessToken()
            .finally(() => {
              refreshPromise = null;
            });

        }

        const newAccessToken = await refreshPromise;

        /**
         * Update original request Authorization header.
         */
        if (originalRequest.headers?.set) {

          originalRequest.headers.set(
            "Authorization",
            `Bearer ${newAccessToken}`
          );

        } else {

          originalRequest.headers =
            originalRequest.headers || {};

          originalRequest.headers.Authorization =
            `Bearer ${newAccessToken}`;

        }

        /**
         * Retry original API request.
         *
         * Request interceptor will also read the
         * updated access token from localStorage.
         */
        return apiClient(originalRequest);

      } catch (refreshError) {

        console.error(
          "JWT access token refresh failed:",
          refreshError.message
        );

        clearAuthentication();

        redirectToLogin();

        return Promise.reject(refreshError);
      }
    }

    /* -----------------------------------------------
       CLIENT-SIDE TIMEOUT
    ----------------------------------------------- */

    if (
      error.code === "ECONNABORTED" ||
      error.code === "ETIMEDOUT"
    ) {

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

    /* -----------------------------------------------
       NETWORK ERROR
    ----------------------------------------------- */

    if (
      error.code === "ERR_NETWORK" ||
      !error.response
    ) {

      const networkError = new Error(
        "Unable to connect to the server. Please verify the backend service and network connection."
      );

      networkError.name = "ApiNetworkError";
      networkError.code =
        error.code || "ERR_NETWORK";

      networkError.status = 0;
      networkError.isNetworkError = true;
      networkError.originalError = error;

      return Promise.reject(networkError);
    }

    /* -----------------------------------------------
       HTTP ERRORS
    ----------------------------------------------- */

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

    /* -----------------------------------------------
       APPLICATION ERROR
    ----------------------------------------------- */

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

