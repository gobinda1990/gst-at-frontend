
import React from "react";
import {
  Outlet,
  useOutletContext,
} from "react-router-dom";

import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import Footer from "../components/layout/Footer";

import "./dashboardLayout.css";

const DashboardLayout = () => {
  /*
   * Receive authentication context from AuthGate.
   *
   * Expected:
   * {
   *   authUser: {
   *     roleId: "R2",
   *     roleName: "Admin",
   *     projectId: "19",
   *     user: {...}
   *   },
   *   role: "ADMIN"
   * }
   */
  const authContext = useOutletContext();

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

            {/* Forward authentication context */}
            <Outlet context={authContext} />

          </main>

          <Footer />

        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
