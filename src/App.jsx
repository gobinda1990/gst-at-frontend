import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import AuthGate from "./services/AuthGate";
import DashboardLayout from "./layouts/DashboardLayout";
import PredictionPage from "./pages/prediction/PredictionPage";
import TaxpayerView from "./pages/prediction/taxpayerview";
import GstReturnDefaulterDashboard from "./pages/GstReturnDefaulterDashboard";
import GstDefaulterProceeding from "./pages/GstDefaulterProceeding";
import GstReturn3BGrowth from "./pages/GstReturn3BGrowth";
import RevenueDashboard from "./pages/OfficeRevenueDashboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AuthGate />}>
          <Route path="/" element={<DashboardLayout />}>
            <Route index element={<Navigate to="return-3b-growth" replace />} />
            <Route path="return-3b-growth" element={<GstReturn3BGrowth />} />
            <Route path="revenue-dashboard" element={<RevenueDashboard />} />
            <Route path="gst-analysis" element={<TaxpayerView />} />
            <Route path="prediction" element={<PredictionPage />} />
            <Route path="return-defaulters" element={<GstReturnDefaulterDashboard />} />
            <Route path="defaulter-proceedings" element={<GstDefaulterProceeding />} />
            <Route path="*" element={<Navigate to="/return-3b-growth" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;