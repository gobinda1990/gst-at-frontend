import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  clearAuth,
  getAccessToken,
  getAuthUser,
  isTokenExpired,
  resolveRole,
  saveAuth,
  secondsToExpiry,
} from "./authStorage";

const toOrigin = (value) => {
  try { return new URL(value.trim()).origin; } catch { return null; }
};

const ALLOWED_ORIGINS = (import.meta.env.VITE_PORTAL_ORIGINS || "https://10.153.43.8:8443")
  .split(",").map(toOrigin).filter(Boolean);
const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || `${ALLOWED_ORIGINS[0]}/dashboard`;
const WAIT_MS = 8000;
const READY_INTERVAL_MS = 500;
const DEV = import.meta.env.DEV;
const debug = (...args) => { if (DEV) console.debug("[AuthGate]", ...args); };

const restoreSession = () => {
  const token = getAccessToken();
  const profile = token ? getAuthUser() : null;
  return { authed: Boolean(token && profile && profile.resolvedRole !== "UNAUTHORIZED"), profile };
};

export default function AuthGate() {
  const navigate = useNavigate();
  const location = useLocation();
  const freshAtMount = useRef(new URLSearchParams(window.location.search).get("fresh") === "true");
  const [session, setSession] = useState(() => {
    if (freshAtMount.current) clearAuth();
    return restoreSession();
  });
  const [timedOut, setTimedOut] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has("fresh") && !params.has("ts")) return;
    params.delete("fresh");
    params.delete("ts");
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : "" }, { replace: true });
    // Only process the initial launch URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (session.authed) return undefined;
    let completed = false;

    const onMessage = (event) => {
      // Verify sender BEFORE accessing credentials or displaying message metadata.
      if (!ALLOWED_ORIGINS.includes(event.origin)) return;
      if (!window.opener || event.source !== window.opener) return;
      const data = event.data;
      if (!data || typeof data !== "object" || Array.isArray(data)) return;
      const token = data.accessToken;
      if (typeof token !== "string" || !token.trim()) return;
      if (isTokenExpired(token)) {
        setReason("Portal sent an expired token. Please sign in again.");
        setTimedOut(true);
        return;
      }

      // Explicit portal role takes precedence over JWT display fallback.
      const portalRole = data.roleName ?? data.user?.roleName ?? null;
      const profileRole = resolveRole(portalRole);
      if (portalRole != null && profileRole === "UNAUTHORIZED") {
        setReason("Portal role is unrecognized. Contact your portal administrator.");
        setTimedOut(true);
        return;
      }
      try {
        saveAuth(data);
        const profile = getAuthUser();
        if (!profile || profile.resolvedRole === "UNAUTHORIZED") {
          clearAuth();
          setReason("Portal role is missing or unrecognized.");
          setTimedOut(true);
          return;
        }
        completed = true;
        debug("Authentication accepted", {
          roleId: profile.roleId,
          roleName: profile.roleName,
          resolvedRole: profile.resolvedRole,
          secondsToExpiry: secondsToExpiry(token),
        });
        setSession({ authed: true, profile });
        setTimedOut(false);
        setReason("");
      } catch {
        clearAuth();
        setReason("Unable to save the authentication session.");
        setTimedOut(true);
      }
    };

    window.addEventListener("message", onMessage);
    const sendReady = () => {
      if (!window.opener) return;
      ALLOWED_ORIGINS.forEach((origin) => {
        try { window.opener?.postMessage({ type: "CHILD_READY" }, origin); }
        catch { /* opener may have closed */ }
      });
    };
    sendReady();
    const readyTimer = window.opener ? setInterval(sendReady, READY_INTERVAL_MS) : null;
    const timeout = setTimeout(() => {
      if (completed) return;
      const restored = restoreSession();
      if (restored.authed) {
        setSession(restored);
        return;
      }
      setReason((current) => current || "Portal did not send a valid session. Reopen the module from the portal.");
      setTimedOut(true);
    }, WAIT_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      if (readyTimer !== null) clearInterval(readyTimer);
      clearTimeout(timeout);
    };
  }, [session.authed]);

  useEffect(() => {
    const onLogout = () => {
      clearAuth();
      setSession({ authed: false, profile: null });
      setTimedOut(true);
      setReason("The API rejected this session. Please sign in through the portal again.");
    };
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, []);

  if (session.authed && session.profile) {
    const role = session.profile.resolvedRole;
    return (
      <Outlet context={{
        authUser: session.profile,
        role,
        isSuperAdmin: role === "SUPER_ADMIN",
        isAdmin: role === "ADMIN",
        isUser: role === "USER",
      }} />
    );
  }

  if (!timedOut) {
    return <div style={{ padding: 40, textAlign: "center" }}>Authenticating with portal…</div>;
  }

  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <h3>Authentication Required</h3>
      <p>Session not found or expired. Please open this module from the portal.</p>
      {reason && <p style={{ color: "#b42318" }}>{reason}</p>}
      <a href={PORTAL_URL}>Go to portal</a>
    </div>
  );
}
