import React from "react";
import "./footer.css";

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-content">
        <span className="footer-text">
          © {new Date().getFullYear()} GST AI Platform
        </span>

        <span className="footer-divider" aria-hidden="true">|</span>

        <span className="footer-text">
          Government Tax Intelligence System
        </span>
      </div>
    </footer>
  );
};

export default Footer;
