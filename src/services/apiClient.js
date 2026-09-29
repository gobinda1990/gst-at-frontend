import axios from "axios";

/**
 * Central Axios client.
 *
 * VITE_API_BASE examples:
 *
 * Development:
 * VITE_API_BASE=http://localhost:8087/api
 *
 * Production behind Nginx:
 * VITE_API_BASE=/api
 */
export const apiClient = axios.create({
  // baseURL: import.meta.env.VITE_API_BASE || "http://localhost:8087/api",
  baseURL:"/api",

  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },

  withCredentials: false,

  timeout: 30000,
});

/* =========================================================
   REQUEST INTERCEPTOR
========================================================= */

apiClient.interceptors.request.use(
  (config) => {
    /*
     * Add authentication here later if required:
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
   * All API methods receive response.data directly.
   *
   * Therefore:
   *
   * const data = await apiClient.get("/endpoint");
   *
   * NOT:
   *
   * const response = await apiClient.get("/endpoint");
   * return response.data;
   */
  (response) => response.data,

  (error) => {
    /*
     * Do not convert cancelled requests into custom errors.
     * This allows axios.isCancel(error) to continue working.
     */
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    const status = error.response?.status;

    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      `Request failed (${status || "Network Error"})`;

    const customError = new Error(message);

    customError.name = "ApiError";
    customError.status = status;
    customError.data = error.response?.data;
    customError.originalError = error;

    return Promise.reject(customError);
  }
);

export default apiClient;