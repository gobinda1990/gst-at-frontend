import React, { useState } from "react";
import { NavLink } from "react-router-dom";

import {
  FaHome,
  FaBrain,
  FaCog,
  FaBars,
  FaTimes,
  FaUserShield,
  FaFileInvoiceDollar,
  FaChartPie,
  FaChartLine
} from "react-icons/fa";

import "./sidebar.css";

const Sidebar = () => {
  const [open, setOpen] = useState(false);

  const toggleSidebar = () => setOpen(!open);
  const closeSidebar = () => setOpen(false);

  return (
    <>
      {/* MOBILE TOGGLE BUTTON */}
      <button
        className="sidebar-toggle-btn"
        onClick={toggleSidebar}
        aria-label="Toggle navigation menu"
      >
        {open ? <FaTimes /> : <FaBars />}
      </button>

      {/* OVERLAY */}
      {open && (
        <div className="sidebar-overlay" onClick={closeSidebar} />
      )}

      {/* SIDEBAR */}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        {/* MENU */}
        <ul className="sidebar-menu">
          {/* HOME / DASHBOARD */}
          <li>
            <NavLink to="/" end onClick={closeSidebar}>
              <FaHome />
              <span>Dashboard</span>
            </NavLink>
          </li>

          {/* REVENUE DASHBOARD */}
          <li>
            <NavLink to="/revenue-dashboard" onClick={closeSidebar}>
              <FaChartPie />
              <span>Revenue Summary</span>
            </NavLink>
          </li>

           {/* RETURN DEFAULTERS */}
          <li>
            <NavLink to="/return-defaulters" onClick={closeSidebar}>
              <FaFileInvoiceDollar />
              <span>Return Defaulters</span>
            </NavLink>
          </li>

          {/* GST ANALYSIS */}
          <li>
            <NavLink to="/gst-analysis" onClick={closeSidebar}>
              <FaChartLine />
              <span>Taxpayer View</span>
            </NavLink>
          </li>

          {/* AUDIT DESK */}
          {/* <li>
            <NavLink to="/audit-desk" onClick={closeSidebar}>
              <FaUserShield />
              <span>Audit Desk</span>
            </NavLink>
          </li> */}

         

          {/* PREDICTION */}
          <li>
            <NavLink to="/prediction" onClick={closeSidebar}>
              <FaBrain />
              <span>Prediction</span>
            </NavLink>
          </li>

          {/* SETTINGS */}
          <li>
            <NavLink to="/settings" onClick={closeSidebar}>
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