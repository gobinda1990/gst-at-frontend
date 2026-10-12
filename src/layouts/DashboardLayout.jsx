import React, { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useOutletContext } from "react-router-dom";

import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import Footer from "../components/layout/Footer";

import "./dashboardLayout.css";

const MOBILE_QUERY = "(max-width: 768px)";
const TABLET_QUERY = "(max-width: 992px)";

const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);

    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
};

const DashboardLayout = () => {
  /*
   * Authentication context from AuthGate:
   * { authUser: { roleId, roleName, projectId, user }, role }
   * Forwarded unchanged to every child route.
   */
  const authContext = useOutletContext();

  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [collapsed, setCollapsed] = useState(
    () => window.matchMedia(TABLET_QUERY).matches
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileOpen((open) => !open);
    } else {
      setCollapsed((current) => !current);
    }
  }, [isMobile]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  // Close the drawer after navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Reset the drawer when leaving mobile width
  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  const drawerVisible = isMobile && mobileOpen;

  // Escape closes the drawer; lock page scroll while it is open
  useEffect(() => {
    if (!drawerVisible) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerVisible]);

  const menuExpanded = isMobile ? mobileOpen : !collapsed;

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <Header onMenuClick={toggleSidebar} menuExpanded={menuExpanded} />

      <Sidebar
        mobileOpen={mobileOpen}
        collapsed={collapsed}
        onClose={closeMobile}
      />

      <div className="main-content-area">
        <main className="page-content">
          <Outlet context={authContext} />
        </main>

        <Footer />
      </div>
    </div>
  );
};

export default DashboardLayout;
