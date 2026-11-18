import axios from "axios";
import {
  getAccessToken,
  updateAccessToken,
  clearAuth,
  getTokenExpiryMs,
} from "./authStorage";

const API_BASE_URL = (import.meta.env.VITE_API_BASE?.trim() || "/api").replace(/\/+$/, "");
const AUTH_BASE_URL = (import.meta.env.VITE_AUTH_BASE?.trim() || "/api/auth").replace(/\/+$/, "");
const REFRESH_ENDPOINT = `${AUTH_BASE_URL}/refresh-token`;
const DEFAULT_TIMEOUT = 120000;
const REFRESH_TIMEOUT = 30000;
const REFRESH_SKEW_MS = 60 * 1000;
const REFRESH_RETRY_MS = 30 * 1000;
const MAX_TIMER_MS = 2 ** 31 - 1;
const REFRESH_LOCK_NAME = "portal-token-refresh";

const baseConfig = {
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  withCredentials: true,
};

export const apiClient = axios.create({ ...baseConfig, timeout: DEFAULT_TIMEOUT });
// Keep refresh calls separate so their errors cannot recursively trigger the API 401 interceptor.
const { baseURL: _ignoredBaseUrl, ...refreshConfig } = baseConfig;
const refreshClient = axios.create({ ...refreshConfig, timeout: REFRESH_TIMEOUT });

let refreshPromise = null;
let refreshTimer = null;
let sessionEnded = false;
let sessionExpiredHandler = null;
const isBrowser = typeof window !== "undefined";

function isAuthenticationUrl(url = "") {
  const clean = String(url).split("?")[0].replace(/\/+$/, "");
  return clean.endsWith("/auth/refresh-token") || clean.endsWith("/auth/login");
}

function isExpiringSoon(token) {
  const expiry = getTokenExpiryMs(token);
  return expiry !== null && expiry - Date.now() <= REFRESH_SKEW_MS;
}

function setAuthHeader(config, token) {
  if (config.headers?.set) config.headers.set("Authorization", `Bearer ${token}`);
  else {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
}

function runExclusive(fn) {
  if (isBrowser && navigator.locks?.request) {
    return navigator.locks.request(REFRESH_LOCK_NAME, fn);
  }
  return fn();
}

export function setSessionExpiredHandler(handler) {
  sessionExpiredHandler = typeof handler === "function" ? handler : null;
}

/** End the local session only when the refresh cookie is rejected. Never call a login API. */
export function endSession({ redirect = false } = {}) {
  stopProactiveRefresh();
  clearAuth();
  if (!redirect || sessionEnded) return;
  sessionEnded = true;

  if (sessionExpiredHandler) {
    sessionExpiredHandler();
  } else if (isBrowser) {
    // Let AuthGate show its portal sign-in prompt; do not navigate to or call /login.
    window.dispatchEvent(new Event("auth:logout"));
  }
}

async function requestNewAccessToken() {
  // Refresh uses the HttpOnly refresh-token cookie (withCredentials), not the login endpoint.
  const response = await refreshClient.post(REFRESH_ENDPOINT, {});
  const newToken = response.data?.data?.accessToken;
  if (typeof newToken !== "string" || !newToken) {
    throw new Error(response.data?.message || "Unable to retrieve a new access token.");
  }
  updateAccessToken(newToken);
  scheduleProactiveRefresh(newToken);
  return newToken;
}

/** Single-flight per tab, and exclusive across tabs when Web Locks are available. */
function refreshOnce() {
  if (!refreshPromise) {
    const tokenAtStart = getAccessToken();
    refreshPromise = runExclusive(async () => {
      // A different tab may have refreshed while this tab waited for the lock.
      const stored = getAccessToken();
      if (stored && stored !== tokenAtStart && !isExpiringSoon(stored)) {
        scheduleProactiveRefresh(stored);
        return stored;
      }
      return requestNewAccessToken();
    }).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function isRefreshTokenRejected(error) {
  return error?.response?.status === 401 || error?.response?.status === 403;
}

function handleRefreshFailure(error) {
  if (isRefreshTokenRejected(error)) endSession({ redirect: true });
}

function stopProactiveRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = null;
}

function scheduleProactiveRefresh(token, delayOverride) {
  if (!isBrowser) return;
  stopProactiveRefresh();
  let delay = delayOverride;
  if (delay === undefined) {
    const expiry = getTokenExpiryMs(token);
    if (expiry === null) return;
    delay = expiry - Date.now() - REFRESH_SKEW_MS;
  }
  delay = Math.min(Math.max(delay, 0), MAX_TIMER_MS);
  refreshTimer = setTimeout(async () => {
    try {
      await refreshOnce();
    } catch (error) {
      if (isRefreshTokenRejected(error)) handleRefreshFailure(error);
      else if (getAccessToken()) scheduleProactiveRefresh(null, REFRESH_RETRY_MS);
    }
  }, delay);
}

export function startAuthRefresh() {
  sessionEnded = false;
  const token = getAccessToken();
  if (token) scheduleProactiveRefresh(token);
}

export function setAccessToken(accessToken) {
  updateAccessToken(accessToken);
  sessionEnded = false;
  scheduleProactiveRefresh(accessToken);
}

if (isBrowser) {
  startAuthRefresh();

  const refreshIfNeeded = () => {
    const token = getAccessToken();
    if (token && isExpiringSoon(token)) {
      refreshOnce().catch(handleRefreshFailure);
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshIfNeeded();
  });
  window.addEventListener("online", refreshIfNeeded);
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== "accessToken") return;
    const token = getAccessToken();
    if (token) {
      sessionEnded = false;
      scheduleProactiveRefresh(token);
    } else stopProactiveRefresh();
  });
}

const DEFAULT_MESSAGES = {
  400: "Invalid request.",
  401: "Your session has expired. Please sign in again.",
  403: "You are not authorized to perform this operation.",
  404: "The requested resource was not found.",
  408: "The server timed out while processing the request.",
  429: "Too many requests. Please wait and try again.",
  500: "An internal server error occurred.",
  502: "The backend service is temporarily unavailable.",
  503: "The service is temporarily unavailable.",
  504: "The server took too long to complete the request.",
};

function normalizeError(error) {
  if (!axios.isAxiosError(error)) return error;
  const status = error.response?.status;
  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    const normalized = new Error("The server is taking longer than expected to process the request. Please try again.");
    normalized.name = "ApiTimeoutError";
    normalized.code = error.code;
    normalized.status = 408;
    normalized.isTimeout = true;
    normalized.data = error.response?.data;
    normalized.originalError = error;
    return normalized;
  }
  if (error.code === "ERR_NETWORK" || !error.response) {
    const normalized = new Error("Unable to connect to the server. Please verify the backend service and network connection.");
    normalized.name = "ApiNetworkError";
    normalized.code = error.code || "ERR_NETWORK";
    normalized.status = 0;
    normalized.isNetworkError = true;
    normalized.originalError = error;
    return normalized;
  }
  const data = error.response.data;
  const serverMessage = data && typeof data === "object" && !(data instanceof Blob)
    ? data.message || data.error
    : typeof data === "string" && data.length < 300 ? data : null;
  const normalized = new Error(serverMessage || DEFAULT_MESSAGES[status] || error.message || `Request failed (${status || "Unknown Error"}).`);
  normalized.name = "ApiError";
  normalized.code = error.code;
  normalized.status = status;
  normalized.data = data;
  normalized.originalError = error;
  return normalized;
}

apiClient.interceptors.request.use(async (config) => {
  let token = getAccessToken();
  // Do not send an expired/nearly expired bearer token if refresh fails.
  // The protected API request is held until the refresh-token endpoint succeeds.
  if (token && !isAuthenticationUrl(config.url) && isExpiringSoon(token)) {
    try {
      token = await refreshOnce();
    } catch (error) {
      handleRefreshFailure(error);
      throw error;
    }
  }
  if (token) setAuthHeader(config, token);
  return config;
});

apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    if (axios.isCancel(error) || error.code === "ERR_CANCELED") return Promise.reject(error);
    const originalRequest = error.config;
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthenticationUrl(originalRequest.url)) {
      originalRequest._retry = true;
      try {
        const newToken = await refreshOnce();
        setAuthHeader(originalRequest, newToken);
        return apiClient(originalRequest);
      } catch (refreshError) {
        handleRefreshFailure(refreshError);
        return Promise.reject(normalizeError(refreshError));
      }
    }
    return Promise.reject(normalizeError(error));
  }
);

export default apiClient;
