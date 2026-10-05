import React, { useCallback, useState } from "react";
import { NavLink } from "react-router-dom";

import {
  FaHome,
  FaBrain,
  FaCog,
  FaBars,
  FaTimes,
  FaFileInvoiceDollar,
  FaChartPie,
  FaChartLine,
  FaGavel,
} from "react-icons/fa";

import "./sidebar.css";

const Sidebar = () => {
  const [open, setOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setOpen((current) => !current);
  }, []);

  const closeSidebar = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <>
      {/* =====================================================
          MOBILE MENU BUTTON
      ====================================================== */}
      <button
        type="button"
        className="sidebar-toggle-btn"
        onClick={toggleSidebar}
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls="main-sidebar"
      >
        {open ? <FaTimes /> : <FaBars />}
      </button>

      {/* =====================================================
          MOBILE OVERLAY
      ====================================================== */}
      {open && (
        <div
          className="sidebar-overlay"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* =====================================================
          SIDEBAR
      ====================================================== */}
      <aside
        id="main-sidebar"
        className={`sidebar ${open ? "open" : ""}`}
        aria-label="Main navigation"
      >
        <ul className="sidebar-menu">

          {/* Dashboard */}
          <li>
            <NavLink
              to="/"
              end
              onClick={closeSidebar}
            >
              <FaHome />
              <span>Dashboard</span>
            </NavLink>
          </li>

          {/* Revenue */}
          <li>
            <NavLink
              to="/revenue-dashboard"
              onClick={closeSidebar}
            >
              <FaChartPie />
              <span>Revenue Summary</span>
            </NavLink>
          </li>

          {/* Return Defaulters / Analytics */}
          <li>
            <NavLink
              to="/return-defaulters"
              onClick={closeSidebar}
            >
              <FaFileInvoiceDollar />
              <span>Return Defaulters</span>
            </NavLink>
          </li>

          {/* Defaulter Statutory Proceedings */}
          <li>
            <NavLink
              to="/defaulter-proceedings"
              onClick={closeSidebar}
            >
              <FaGavel />
              <span>Defaulter Proceedings</span>
            </NavLink>
          </li>

          {/* Taxpayer Analysis */}
          <li>
            <NavLink
              to="/gst-analysis"
              onClick={closeSidebar}
            >
              <FaChartLine />
              <span>Taxpayer Search</span>
            </NavLink>
          </li>

          {/* Prediction */}
          <li>
            <NavLink
              to="/prediction"
              onClick={closeSidebar}
            >
              <FaBrain />
              <span>Prediction</span>
            </NavLink>
          </li>

          {/* Settings */}
          <li>
            <NavLink
              to="/settings"
              onClick={closeSidebar}
            >
              <FaCog />
              <span>Settings</span>
            </NavLink>
          </li>

        </ul>
      </aside>
    </>
  );
};

export default Sidebar;