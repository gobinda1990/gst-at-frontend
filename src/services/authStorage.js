// /** Portal authentication storage. Browser JWT decoding is NOT signature verification. */
// const KEYS = ["accessToken", "user", "roleId", "roleName", "projectId"];

// export const decodeJwt = (token) => {
//   try {
//     if (typeof token !== "string") return null;
//     const part = token.split(".")[1];
//     if (!part) return null;
//     const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
//     const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
//     return JSON.parse(atob(padded));
//   } catch {
//     return null;
//   }
// };

// export const isTokenExpired = (token, skewSec = 10) => {
//   const exp = decodeJwt(token)?.exp;
//   return typeof exp !== "number" || exp * 1000 <= Date.now() + skewSec * 1000;
// };

// export const secondsToExpiry = (token) => {
//   const exp = decodeJwt(token)?.exp;
//   return typeof exp === "number" ? Math.max(0, Math.floor(exp - Date.now() / 1000)) : null;
// };

// export const getAccessToken = () => {
//   try {
//     const token = localStorage.getItem("accessToken");
//     return token && !isTokenExpired(token) ? token : null;
//   } catch {
//     return null;
//   }
// };

// export const normalizeRole = (value) =>
//   String(value ?? "").trim().toUpperCase().replace(/^ROLE_/, "").replace(/[\s-]+/g, "_");

// export const resolveRole = (value) => {
//   const role = normalizeRole(value);
//   return ["SUPER_ADMIN", "ADMIN", "USER"].includes(role) ? role : "UNAUTHORIZED";
// };

// export const saveAuth = ({ accessToken, user, roleId, roleName, projectId } = {}) => {
//   if (!accessToken || isTokenExpired(accessToken)) {
//     throw new Error("Invalid or expired portal token");
//   }
//   const claims = decodeJwt(accessToken);
//   // Portal role is used for display; the API must authorize using verified server-side data.
//   const displayRole = roleName ?? user?.roleName ?? claims?.roleName ?? claims?.roles?.[0] ?? "";
//   const displayRoleId = roleId ?? user?.roleId ?? "";
//   const entries = {
//     accessToken,
//     user: JSON.stringify(user ?? null),
//     roleId: String(displayRoleId),
//     roleName: String(displayRole),
//     projectId: String(projectId ?? user?.projectId ?? ""),
//   };
//   try {
//     Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
//   } catch (error) {
//     clearAuth();
//     throw error;
//   }
// };

// export const getAuthUser = () => {
//   if (!getAccessToken()) return null;
//   try {
//     const rawUser = localStorage.getItem("user");
//     let user = null;
//     try { user = rawUser ? JSON.parse(rawUser) : null; } catch { user = null; }
//     const roleId = localStorage.getItem("roleId")?.trim() || null;
//     const roleName = localStorage.getItem("roleName")?.trim() || null;
//     return {
//       roleId,
//       roleName,
//       resolvedRole: resolveRole(roleName),
//       projectId: localStorage.getItem("projectId")?.trim() || null,
//       user,
//     };
//   } catch {
//     return null;
//   }
// };

// export const clearAuth = () => {
//   KEYS.forEach((key) => {
//     try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
//   });
// };


/**
 * Portal authentication storage.
 * NOTE: decoding a JWT in the browser is NOT signature verification.
 * Roles stored here are for display/routing only; the API must authorize
 * using verified server-side data.
 */

const ACCESS_TOKEN_KEY = "accessToken";
const KEYS = [ACCESS_TOKEN_KEY, "user", "roleId", "roleName", "projectId"];
const VALID_ROLES = ["SUPER_ADMIN", "ADMIN", "USER"];

/* ---------------- JWT helpers ---------------- */

export const decodeJwt = (token) => {
  try {
    if (typeof token !== "string") return null;
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    // UTF-8 safe (names with non-ASCII characters)
    const json = decodeURIComponent(
      Array.from(binary, (c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
};

/** Token expiry as epoch ms, or null if unreadable / no exp claim. */
export const getTokenExpiryMs = (token) => {
  const exp = decodeJwt(token)?.exp;
  return typeof exp === "number" ? exp * 1000 : null;
};

export const isTokenExpired = (token, skewSec = 10) => {
  const expiry = getTokenExpiryMs(token);
  return expiry === null || expiry <= Date.now() + skewSec * 1000;
};

export const secondsToExpiry = (token) => {
  const expiry = getTokenExpiryMs(token);
  return expiry === null ? null : Math.max(0, Math.floor((expiry - Date.now()) / 1000));
};

/* ---------------- Token access ---------------- */

/**
 * Raw stored token, EVEN IF EXPIRED.
 * An expired access token is renewable through the refresh cookie, so it
 * must not be treated as "logged out".
 */
export const getAccessToken = () => {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY) || null;
  } catch {
    return null;
  }
};

/** Token that can be sent as-is (present and not expired). */
export const getUsableAccessToken = () => {
  const token = getAccessToken();
  return token && !isTokenExpired(token) ? token : null;
};

/**
 * Used after a refresh: updates ONLY the access token.
 * Expiry is intentionally NOT validated here: a wrong device clock would
 * make a brand-new token look expired and break the refresh.
 */
export const updateAccessToken = (accessToken) => {
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("Invalid access token");
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
};

/* ---------------- Roles ---------------- */

export const normalizeRole = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^ROLE_/, "")
    .replace(/[\s-]+/g, "_");

export const resolveRole = (value) => {
  const role = normalizeRole(value);
  return VALID_ROLES.includes(role) ? role : "UNAUTHORIZED";
};

/* ---------------- Session ---------------- */

export const clearAuth = () => {
  KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  });
};

/** Call after login / portal handoff. Then call startAuthRefresh() from apiClient. */
export const saveAuth = ({ accessToken, user, roleId, roleName, projectId } = {}) => {
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("Invalid portal token");
  }

  const claims = decodeJwt(accessToken);
  const displayRole = roleName ?? user?.roleName ?? claims?.roleName ?? claims?.roles?.[0] ?? "";
  const displayRoleId = roleId ?? user?.roleId ?? "";

  const entries = {
    [ACCESS_TOKEN_KEY]: accessToken,
    user: JSON.stringify(user ?? null),
    roleId: String(displayRoleId),
    roleName: String(displayRole),
    projectId: String(projectId ?? user?.projectId ?? ""),
  };

  try {
    Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
  } catch (error) {
    clearAuth(); // never leave a half-written session
    throw error;
  }
};

export const getAuthUser = () => {
  // Session exists while a token is stored; apiClient keeps it renewed.
  if (!getAccessToken()) return null;

  try {
    let user = null;
    try {
      const rawUser = localStorage.getItem("user");
      user = rawUser ? JSON.parse(rawUser) : null;
    } catch {
      user = null;
    }

    const roleName = localStorage.getItem("roleName")?.trim() || null;

    return {
      roleId: localStorage.getItem("roleId")?.trim() || null,
      roleName,
      resolvedRole: resolveRole(roleName),
      projectId: localStorage.getItem("projectId")?.trim() || null,
      user,
    };
  } catch {
    return null;
  }
};
