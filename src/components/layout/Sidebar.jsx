import React from "react";
import { NavLink } from "react-router-dom";

import {
  FaHome,
  FaBrain,
  FaCog,
  FaFileInvoiceDollar,
  FaChartPie,
  FaSearch,
  FaGavel,
} from "react-icons/fa";

import "./sidebar.css";

const MENU = [
  { to: "/", label: "Dashboard", icon: FaHome, end: true },
  { to: "/revenue-dashboard", label: "Revenue Summary", icon: FaChartPie },
  { to: "/return-defaulters", label: "Return Defaulters", icon: FaFileInvoiceDollar },
  { to: "/defaulter-proceedings", label: "Defaulter Proceedings", icon: FaGavel },
  { to: "/gst-analysis", label: "Taxpayer Search", icon: FaSearch },
  { to: "/prediction", label: "Prediction", icon: FaBrain },
  { to: "/settings", label: "Settings", icon: FaCog },
];

const Sidebar = ({ mobileOpen, collapsed, onClose }) => {
  return (
    <>
      <div
        className={`sidebar-overlay ${mobileOpen ? "show" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        id="main-sidebar"
        className={`sidebar ${mobileOpen ? "open" : ""} ${
          collapsed ? "collapsed" : ""
        }`}
        aria-label="Main navigation"
      >
        <nav>
          <ul className="sidebar-menu">
            {MENU.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  title={collapsed ? label : undefined}
                  onClick={onClose}
                >
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
