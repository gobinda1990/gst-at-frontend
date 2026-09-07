import { BrowserRouter, Routes, Route } from "react-router-dom";

import DashboardLayout from "./layouts/DashboardLayout";
import PredictionPage from "./pages/prediction/PredictionPage";
import GstinAnalysisPage from "./pages/prediction/GstinAnalysisPage";
import GstRiskDashboard from "./pages/prediction/GstRiskDashboard";
import GstAuditDashboard from "./pages/dashboard/GstAuditDashboard";
import GstReturnDefaulterDashboard from "./pages/dashboard/GstReturnDefaulterDashboard";
import GstMonthlyRevenueSummary from "./pages/dashboard/GstMonthlyRevenueSummary";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* LAYOUT WRAPPER */}
        <Route path="/" element={<DashboardLayout />}>

          {/* DEFAULT / HOME PAGE */}
          <Route index element={<GstinAnalysisPage />} />

          {/* GSTIN ANALYSIS */}
          <Route
            path="gst-analysis"
            element={<GstinAnalysisPage />}
          />

          {/* RISK DASHBOARD */}
          <Route
            path="risk-dashboard"
            element={<GstRiskDashboard />}
          />

          {/* PREDICTION */}
          <Route
            path="prediction"
            element={<PredictionPage />}
          />

          {/* AUDIT DESK */}
          <Route
            path="audit-desk"
            element={<GstAuditDashboard />}
          />

          {/* RETURN DEFAULTERS */}
          <Route
            path="return-defaulters"
            element={<GstReturnDefaulterDashboard />}
          />

          {/* MONTHLY REVENUE */}
          <Route
            path="monthly-revenue"
            element={<GstMonthlyRevenueSummary />}
          />

        </Route>

      </Routes>
    </BrowserRouter>
  );
}

export default App;