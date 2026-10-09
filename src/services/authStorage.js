/** Portal authentication storage. Browser JWT decoding is NOT signature verification. */
const KEYS = ["accessToken", "user", "roleId", "roleName", "projectId"];

export const decodeJwt = (token) => {
  try {
    if (typeof token !== "string") return null;
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

export const isTokenExpired = (token, skewSec = 10) => {
  const exp = decodeJwt(token)?.exp;
  return typeof exp !== "number" || exp * 1000 <= Date.now() + skewSec * 1000;
};

export const secondsToExpiry = (token) => {
  const exp = decodeJwt(token)?.exp;
  return typeof exp === "number" ? Math.max(0, Math.floor(exp - Date.now() / 1000)) : null;
};

export const getAccessToken = () => {
  try {
    const token = localStorage.getItem("accessToken");
    return token && !isTokenExpired(token) ? token : null;
  } catch {
    return null;
  }
};

export const normalizeRole = (value) =>
  String(value ?? "").trim().toUpperCase().replace(/^ROLE_/, "").replace(/[\s-]+/g, "_");

export const resolveRole = (value) => {
  const role = normalizeRole(value);
  return ["SUPER_ADMIN", "ADMIN", "USER"].includes(role) ? role : "UNAUTHORIZED";
};

export const saveAuth = ({ accessToken, user, roleId, roleName, projectId } = {}) => {
  if (!accessToken || isTokenExpired(accessToken)) {
    throw new Error("Invalid or expired portal token");
  }
  const claims = decodeJwt(accessToken);
  // Portal role is used for display; the API must authorize using verified server-side data.
  const displayRole = roleName ?? user?.roleName ?? claims?.roleName ?? claims?.roles?.[0] ?? "";
  const displayRoleId = roleId ?? user?.roleId ?? "";
  const entries = {
    accessToken,
    user: JSON.stringify(user ?? null),
    roleId: String(displayRoleId),
    roleName: String(displayRole),
    projectId: String(projectId ?? user?.projectId ?? ""),
  };
  try {
    Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
  } catch (error) {
    clearAuth();
    throw error;
  }
};

export const getAuthUser = () => {
  if (!getAccessToken()) return null;
  try {
    const rawUser = localStorage.getItem("user");
    let user = null;
    try { user = rawUser ? JSON.parse(rawUser) : null; } catch { user = null; }
    const roleId = localStorage.getItem("roleId")?.trim() || null;
    const roleName = localStorage.getItem("roleName")?.trim() || null;
    return {
      roleId,
      roleName,
      resolvedRole: resolveRole(roleName),
      projectId: localStorage.getItem("projectId")?.trim() || null,
      user,
    };
  } catch {
    return null;
  }
};

export const clearAuth = () => {
  KEYS.forEach((key) => {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  });
};
