const KEYS = ["accessToken", "user", "roleId", "roleName", "projectId"];

const decodeJwt = (t) => {
  try {
    const b64 = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
};

export const isTokenExpired = (t, skewSec = 10) => {
  const exp = decodeJwt(t)?.exp;
  return !exp || exp * 1000 <= Date.now() + skewSec * 1000;
};

export const secondsToExpiry = (t) => {
  const exp = decodeJwt(t)?.exp;
  return exp ? Math.round(exp - Date.now() / 1000) : null;
};

// returns the stored token only if it is still valid
export const getAccessToken = () => {
  const t = localStorage.getItem("accessToken");
  return t && !isTokenExpired(t) ? t : null;
};

export const saveAuth = ({ accessToken, user, roleId, roleName, projectId }) => {
  const claims = decodeJwt(accessToken);
  localStorage.setItem("accessToken", accessToken);
  localStorage.setItem("user", JSON.stringify(user ?? null));
  localStorage.setItem("roleId", roleId ?? "");
  // display only; the backend must enforce roles from the validated JWT
  localStorage.setItem("roleName", roleName ?? claims?.roles?.[0] ?? "");
  localStorage.setItem("projectId", projectId ?? "");
};

export const clearAuth = () => KEYS.forEach((k) => localStorage.removeItem(k));