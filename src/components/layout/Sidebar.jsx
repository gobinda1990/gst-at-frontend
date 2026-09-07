import React, { useState } from "react";
import { NavLink } from "react-router-dom";

import {
  FaHome,
  FaBrain, 
  FaCog,
  FaBars,
  FaTimes,
  FaSearchLocation,
  FaExclamationTriangle,
  FaUserShield,
  FaFileInvoiceDollar,
  FaCoins 
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
          <li>
            <NavLink to="/" end onClick={closeSidebar}>
              <FaHome />
              <span>Dashboard</span>
            </NavLink>
          </li>

          <li>
            <NavLink to="/monthly-revenue" onClick={closeSidebar}>
              <FaCoins />
              <span>Monthly Revenue</span>
            </NavLink>
          </li>  
          <li>
            <NavLink to="/audit-desk" onClick={closeSidebar}>
              <FaUserShield />
              <span>Audit Desk</span>
            </NavLink>
          </li>

          <li>
            <NavLink to="/return-defaulters" onClick={closeSidebar}>
              <FaFileInvoiceDollar />
              <span>Return Defaulters</span>
            </NavLink>
          </li>

          <li>
            <NavLink to="/prediction" onClick={closeSidebar}>
              <FaBrain />
              <span>Prediction</span>
            </NavLink>
          </li> 
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