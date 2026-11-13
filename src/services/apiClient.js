import axios from "axios";
import {
  getAccessToken,
  updateAccessToken,
  clearAuth,
  getTokenExpiryMs,
} from "./authStorage"; // adjust path

/**
 * CENTRAL AXIOS API CLIENT
 *
 * Access token  : localStorage (15 min)
 * Refresh token : HttpOnly cookie
 *
 * The user is NOT sent to login when the access token expires. Renewal:
 *  1. Proactive timer  - refresh shortly before expiry
 *  2. Wake-up check    - refresh when tab becomes visible / network returns
 *  3. Request guard    - refresh before sending if token is (nearly) expired
 *  4. 401 fallback     - refresh once, retry the request
 *
 * One refresh runs at a time, across requests AND across browser tabs
 * (Web Locks), which is safe even if the backend rotates refresh tokens.
 *
 * Login is requested ONLY when the refresh token itself is rejected (401/403).
 * Network errors, timeouts and 5xx never end the session.
 *
 * ENV:
 *   VITE_API_BASE   e.g. /api (prod)  | http://localhost:8087/api (dev)
 *   VITE_AUTH_BASE  e.g. /api/auth    | http://10.153.43.8:8081/api/auth
 *
 * NOTE: the refresh cookie is SameSite=Lax, so the auth URL must be
 * same-site with the page (same-origin proxy recommended).
 */

/* =========================================================
   CONFIG
========================================================= */

const API_BASE_URL =
  import.meta.env.VITE_API_BASE?.trim() ||
  (import.meta.env.DEV ? "/api" : "/api");

const AUTH_BASE_URL = (
  import.meta.env.VITE_AUTH_BASE?.trim() || "http://auth:8081/api/auth"
).replace(/\/+$/, "");

const REFRESH_ENDPOINT = `${AUTH_BASE_URL}/refresh-token`;

const DEFAULT_TIMEOUT = 120000;
const REFRESH_TIMEOUT = 30000;

const LOGIN_PAGE = "/login";
const REFRESH_SKEW_MS = 60 * 1000; // refresh this long BEFORE expiry
const REFRESH_RETRY_MS = 30 * 1000; // retry after a temporary failure
const MAX_TIMER_MS = 2 ** 31 - 1; // setTimeout upper limit
const REFRESH_LOCK_NAME = "portal-token-refresh";

/* =========================================================
   AXIOS INSTANCES
========================================================= */

const baseConfig = {
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  withCredentials: true,
};

export const apiClient = axios.create({ ...baseConfig, timeout: DEFAULT_TIMEOUT });

// Separate instance so refresh calls never trigger the 401 interceptor.
const refreshClient = axios.create({ ...baseConfig, timeout: REFRESH_TIMEOUT });

/* =========================================================
   STATE
========================================================= */

let refreshPromise = null;
let refreshTimer = null;
let sessionEnded = false;
let sessionExpiredHandler = null;

/* =========================================================
   HELPERS
========================================================= */

const isBrowser = typeof window !== "undefined";

/** Works for relative and absolute URLs. */
function isAuthenticationUrl(url = "") {
  const clean = String(url).split("?")[0].replace(/\/+$/, "");
  return clean.endsWith("/auth/refresh-token") || clean.endsWith("/auth/login");
}

function isExpiringSoon(token) {
  const expiry = getTokenExpiryMs(token);
  if (expiry === null) return false; // unknown -> let the 401 fallback handle it
  return expiry - Date.now() <= REFRESH_SKEW_MS;
}

function setAuthHeader(config, token) {
  if (config.headers?.set) {
    config.headers.set("Authorization", `Bearer ${token}`);
  } else {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
}

/** Run fn exclusively across tabs when Web Locks exist. */
function runExclusive(fn) {
  if (isBrowser && navigator.locks?.request) {
    return navigator.locks.request(REFRESH_LOCK_NAME, fn);
  }
  return fn();
}

/* =========================================================
   SESSION END
========================================================= */

/**
 * Optional: let your router handle the redirect instead of a full reload.
 *   setSessionExpiredHandler(() => navigate("/login", { replace: true }));
 */
export function setSessionExpiredHandler(handler) {
  sessionExpiredHandler = typeof handler === "function" ? handler : null;
}

/** Clears stored auth and stops the timer. Use for manual logout too. */
export function endSession({ redirect = false } = {}) {
  stopProactiveRefresh();
  clearAuth();

  if (!redirect || sessionEnded) return;
  sessionEnded = true;

  if (sessionExpiredHandler) {
    sessionExpiredHandler();
  } else if (isBrowser && window.location.pathname !== LOGIN_PAGE) {
    window.location.replace(LOGIN_PAGE);
  }
}

/* =========================================================
   REFRESH
========================================================= */

async function requestNewAccessToken() {
  const response = await refreshClient.post(REFRESH_ENDPOINT, {});
  const apiResponse = response.data;
  const newToken = apiResponse?.data?.accessToken;

  if (!newToken) {
    throw new Error(apiResponse?.message || "Unable to retrieve a new access token.");
  }

  updateAccessToken(newToken);
  scheduleProactiveRefresh(newToken);
  return newToken;
}

/** Single-flight per tab + exclusive across tabs. */
function refreshOnce() {
  if (!refreshPromise) {
    const tokenAtStart = getAccessToken();

    refreshPromise = runExclusive(async () => {
      // Another tab may have refreshed while we waited for the lock.
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

/** Only an explicit rejection of the refresh token ends the session. */
function isRefreshTokenRejected(error) {
  const status = error?.response?.status;
  return status === 401 || status === 403;
}

function handleRefreshFailure(error) {
  if (isRefreshTokenRejected(error)) {
    endSession({ redirect: true });
  }
}

/* =========================================================
   PROACTIVE REFRESH
========================================================= */

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
      if (isRefreshTokenRejected(error)) {
        handleRefreshFailure(error);
      } else if (getAccessToken()) {
        // Temporary problem (offline, 5xx): try again shortly.
        scheduleProactiveRefresh(null, REFRESH_RETRY_MS);
      }
    }
  }, delay);
}

/**
 * Call once after login / portal handoff (after saveAuth). It also runs
 * automatically on page load when a token already exists.
 */
export function startAuthRefresh() {
  sessionEnded = false;
  const token = getAccessToken();
  if (token) scheduleProactiveRefresh(token);
}

/** Convenience: store a new token and (re)start the timer. */
export function setAccessToken(accessToken) {
  updateAccessToken(accessToken);
  sessionEnded = false;
  scheduleProactiveRefresh(accessToken);
}

if (isBrowser) {
  startAuthRefresh();

  // Timers are throttled in background tabs and paused while asleep.
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

  // Keep tabs in sync (refresh/logout done in another tab).
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== "accessToken") return;
    const token = getAccessToken();
    if (token) {
      sessionEnded = false;
      scheduleProactiveRefresh(token);
    } else {
      stopProactiveRefresh();
    }
  });
}

/* =========================================================
   ERROR NORMALIZATION
========================================================= */

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
  // Already a plain Error (e.g. missing token in refresh response).
  if (!axios.isAxiosError(error)) return error;

  const status = error.response?.status;

  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    const e = new Error(
      "The server is taking longer than expected to process the request. Please try again."
    );
    e.name = "ApiTimeoutError";
    e.code = error.code;
    e.status = 408;
    e.isTimeout = true;
    e.data = error.response?.data;
    e.originalError = error;
    return e;
  }

  if (error.code === "ERR_NETWORK" || !error.response) {
    const e = new Error(
      "Unable to connect to the server. Please verify the backend service and network connection."
    );
    e.name = "ApiNetworkError";
    e.code = error.code || "ERR_NETWORK";
    e.status = 0;
    e.isNetworkError = true;
    e.originalError = error;
    return e;
  }

  const data = error.response.data;
  // Blob responses (file/CSV download) have no readable message.
  const serverMessage =
    data && typeof data === "object" && !(data instanceof Blob)
      ? data.message || data.error
      : typeof data === "string" && data.length < 300
        ? data
        : null;

  const e = new Error(
    serverMessage ||
      DEFAULT_MESSAGES[status] ||
      error.message ||
      `Request failed (${status || "Unknown Error"}).`
  );
  e.name = "ApiError";
  e.code = error.code;
  e.status = status;
  e.data = data;
  e.originalError = error;
  return e;
}

/* =========================================================
   REQUEST INTERCEPTOR
========================================================= */

apiClient.interceptors.request.use(
  async (config) => {
    let token = getAccessToken();

    // Expired / nearly expired -> refresh BEFORE sending.
    if (token && !isAuthenticationUrl(config.url) && isExpiringSoon(token)) {
      try {
        token = await refreshOnce();
      } catch (error) {
        // Do not fail here; send the request and let the 401 fallback decide.
        handleRefreshFailure(error);
        token = getAccessToken();
      }
    }

    if (token) setAuthHeader(config, token);
    return config;
  },
  (error) => Promise.reject(error)
);

/* =========================================================
   RESPONSE INTERCEPTOR
========================================================= */

apiClient.interceptors.response.use(
  // Callers receive response.data directly.
  (response) => response.data,

  async (error) => {
    if (axios.isCancel(error) || error.code === "ERR_CANCELED") {
      return Promise.reject(error);
    }

    const originalRequest = error.config;
    const status = error.response?.status;

    /* 401 -> refresh once, retry once */
    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthenticationUrl(originalRequest.url)
    ) {
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