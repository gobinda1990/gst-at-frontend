import React from "react";
import { FaBars } from "react-icons/fa";

import "./header.css";

// Tip: download this SVG into src/assets and import it, so the app does not
// depend on an external host.
const EMBLEM_SRC =
  "https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg";

const Header = ({ onMenuClick, menuExpanded = false }) => {
  return (
    <header className="main-header">
      <div className="header-left">
        <button
          type="button"
          className="menu-toggle-btn"
          onClick={onMenuClick}
          aria-label="Toggle navigation menu"
          aria-expanded={menuExpanded}
          aria-controls="main-sidebar"
        >
          <FaBars aria-hidden="true" />
        </button>

        <img
          src={EMBLEM_SRC}
          alt="Emblem of India"
          className="gov-logo"
        />

        <div className="header-text">
          <h1 className="header-title">Directorate of Commercial Taxes</h1>
          <p className="header-subtitle">Government GST Intelligence Platform</p>
        </div>
      </div>
    </header>
  );
};

export default Header;
