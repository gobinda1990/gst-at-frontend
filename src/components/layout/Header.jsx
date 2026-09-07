// =========================================
// FILE: src/components/layout/Header.jsx
// =========================================

import React from "react";

import {
  FaHome,
  FaBell,
  FaUser,
  FaChevronDown,
  FaBars,
} from "react-icons/fa";

import "./header.css";

const Header = ({ toggleSidebar }) => {
  return (
    <header className="main-header">

      {/* LEFT */}
      <div className="header-left">

        {/* MOBILE MENU */}
        <FaBars
          className="mobile-menu-btn"
          onClick={toggleSidebar}
        />

        {/* LOGO */}
        <img
          src="https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg"
          alt="logo"
          className="gov-logo"
        />

        {/* TEXT */}
        <div className="header-text">

          <h3 className="header-title">
            Directorate of Commercial Taxes
          </h3>

          <p className="header-subtitle">
            Government GST Intelligence Platform
          </p>

        </div>
      </div>     
    </header>
  );
};

export default Header;