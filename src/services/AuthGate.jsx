import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  getAccessToken,
  saveAuth,
  clearAuth,
  isTokenExpired,
  secondsToExpiry,
} from "./authStorage";

const toOrigin = (v) => {
  try {
    return new URL(v.trim()).origin;
  } catch {
    return null;
  }
};

// Portal origin(s): scheme + host + port only, no path.
// The portal page https://10.153.43.8:8443/dashboard has origin https://10.153.43.8:8443
const ALLOWED_ORIGINS = (import.meta.env.VITE_PORTAL_ORIGINS || "https://10.153.43.8:8443")
  .split(",")
  .map(toOrigin)
  .filter(Boolean);

const PORTAL_URL =
  import.meta.env.VITE_PORTAL_URL || `${ALLOWED_ORIGINS[0]}/dashboard`;
const WAIT_MS = 8000;
const READY_INTERVAL_MS = 500;

const DEV = import.meta.env.DEV;
const log = (...a) => DEV && console.log("[AuthGate]", ...a);
const warn = (...a) => DEV && console.warn("[AuthGate]", ...a);
const mask = (t) => (t ? `${t.slice(0, 10)}…${t.slice(-6)} (len ${t.length})` : t);

export default function AuthGate() {
  const navigate = useNavigate();
  const location = useLocation();

  // Portal opens us with ?fresh=true -> discard any stale session first
  const [authed, setAuthed] = useState(() => {
    const fresh = new URLSearchParams(window.location.search).get("fresh") === "true";
    if (fresh) clearAuth();

    log("init", {
      href: window.location.href,
      fresh,
      hasOpener: !!window.opener,
      allowedOrigins: ALLOWED_ORIGINS,
      storedToken: {
        present: !!localStorage.getItem("accessToken"),
        usable: !!getAccessToken(),
      },
    });
    return !!getAccessToken();
  });
  const [timedOut, setTimedOut] = useState(false);
  const [reason, setReason] = useState("");

  // strip ?fresh=true&ts=... from the address bar
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.has("fresh") || p.has("ts")) {
      p.delete("fresh");
      p.delete("ts");
      navigate(
        { pathname: location.pathname, search: p.toString() ? `?${p}` : "" },
        { replace: true }
      );
    }
    // eslint-disable-next-line
  }, []);

  // ask the portal for credentials and receive them
  useEffect(() => {
    if (authed) return;

    let firstLogged = false; // log the token only for the first message that carries one

    const onMessage = (e) => {
      // ---- FIRST LOG: runs before any validation ----
      if (!firstLogged && e.data?.accessToken) {
        firstLogged = true;
        console.log("[AuthGate] FIRST REQUEST: auth token received", {
          fromOrigin: e.origin,
          accessToken: e.data.accessToken, // full token: debug only, remove for production
          secondsToExpiry: secondsToExpiry(e.data.accessToken),
          roleId: e.data.roleId,
          roleName: e.data.roleName,
          projectId: e.data.projectId,
          user: e.data.user,
          originAllowed: ALLOWED_ORIGINS.includes(e.origin),
          fromOpener: e.source === window.opener,
        });
      }

      if (!ALLOWED_ORIGINS.includes(e.origin)) {
        if (e.data?.accessToken) warn("REJECTED: origin not allowed", e.origin);
        return;
      }
      if (!window.opener || e.source !== window.opener) {
        warn("REJECTED: source is not window.opener");
        return;
      }
      const token = e.data?.accessToken;
      if (typeof token !== "string" || !token) return;

      if (isTokenExpired(token)) {
        warn("REJECTED: expired token from portal", {
          secondsToExpiry: secondsToExpiry(token),
        });
        setReason("Portal sent an expired token. Please log in again on the portal.");
        setTimedOut(true);
        return;
      }

      saveAuth(e.data);
      log("ACCEPTED and saved to localStorage", {
        origin: e.origin,
        token: mask(token),
        expiresInSeconds: secondsToExpiry(token),
        roleId: e.data.roleId,
        projectId: e.data.projectId,
      });
      setReason("");
      setAuthed(true);
    };

    window.addEventListener("message", onMessage);

    let readyTimer;
    if (!window.opener) {
      warn("window.opener is null: opened directly or with noopener");
    } else {
      const sendReady = () =>
        ALLOWED_ORIGINS.forEach((o) =>
          window.opener?.postMessage({ type: "CHILD_READY" }, o)
        );
      sendReady();
      readyTimer = setInterval(sendReady, READY_INTERVAL_MS);
      log("CHILD_READY sent every", READY_INTERVAL_MS, "ms to", ALLOWED_ORIGINS);
    }

    const timeout = setTimeout(() => {
      if (getAccessToken()) {
        setAuthed(true);
        return;
      }
      const stored = localStorage.getItem("accessToken");
      warn(`no credentials within ${WAIT_MS}ms`, { storedButExpired: !!stored });
      setReason((r) =>
        r ||
        (stored
          ? "Stored token is expired. Please reopen from the portal."
          : "Handshake timeout: portal did not send credentials")
      );
      setTimedOut(true);
    }, WAIT_MS);

    return () => {
      window.removeEventListener("message", onMessage);
      clearInterval(readyTimer);
      clearTimeout(timeout);
    };
  }, [authed]);

  // apiClient fires this on 401
  useEffect(() => {
    const onLogout = (e) => {
      warn("auth:logout fired", e.detail);
      setReason(`API returned 401 for ${e.detail?.url ?? "unknown request"}`);
      clearAuth();
      setAuthed(false);
      setTimedOut(true);
    };
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, []);

  if (authed) return <Outlet />;

  if (!timedOut) {
    return <div style={{ padding: 40, textAlign: "center" }}>Authenticating…</div>;
  }

  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <p>Session not found or expired. Please open this module from the portal.</p>
      {DEV && reason && <p style={{ color: "#888" }}>Reason: {reason}</p>}
      <a href={PORTAL_URL}>Go to portal</a>
    </div>
  );
}