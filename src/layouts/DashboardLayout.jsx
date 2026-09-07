import React from "react";
import { Outlet } from "react-router-dom";

import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import Footer from "../components/layout/Footer";

import "./dashboardLayout.css";

const DashboardLayout = () => {
  return (
    <div className="dashboard-wrapper">

      {/* HEADER */}
      <Header />

      {/* BODY */}
      <div className="dashboard-body">

        {/* SIDEBAR */}
        <Sidebar />

        {/* MAIN CONTENT */}
        <div className="main-content-area">

          <main className="main-content">
            <Outlet />
          </main>

          <Footer />

        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;