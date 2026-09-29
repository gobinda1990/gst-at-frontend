import { BrowserRouter, Routes, Route } from "react-router-dom";

import DashboardLayout from "./layouts/DashboardLayout";
import PredictionPage from "./pages/prediction/PredictionPage";
import TaxpayerView from "./pages/prediction/taxpayerview";
import GstReturnDefaulterDashboard from "./pages/GstReturnDefaulterDashboard";
import GstReturn3BGrowth from "./pages/GstReturn3BGrowth";
import RevenueDashboard from "./pages/OfficeRevenueDashboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* MAIN DASHBOARD LAYOUT */}
        <Route path="/" element={<DashboardLayout />}>

          {/* DEFAULT / HOME */}
          <Route index element={<GstReturn3BGrowth />} />

          {/* GST 3B GROWTH */}
          <Route
            path="return-3b-growth"
            element={<GstReturn3BGrowth />}
          />

          {/* REVENUE DASHBOARD */}
          <Route
            path="revenue-dashboard"
            element={<RevenueDashboard />}
          />

          {/* GSTIN / TAXPAYER ANALYSIS */}
          <Route
            path="gst-analysis"
            element={<TaxpayerView />}
          />

          {/* AI PREDICTION */}
          <Route
            path="prediction"
            element={<PredictionPage />}
          />

          {/* RETURN DEFAULTERS */}
          <Route
            path="return-defaulters"
            element={<GstReturnDefaulterDashboard />}
          />

        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;