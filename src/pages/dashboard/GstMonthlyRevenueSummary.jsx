import React, { useEffect, useState, useCallback, useMemo } from "react";
import { 
  BarChart3, 
  Download, 
  RefreshCw, 
  Calendar, 
  Briefcase, 
  IndianRupee 
} from "lucide-react";
import { 
  fetchMonthlyRevenueSummary, 
  fetchFinancialYears 
} from "../../services/dashboardService";

// Helper to calculate current Indian Financial Year (April to March)
const getCurrentFinancialYear = () => {
  const now = new Date();
  const month = now.getMonth() + 1; // 1 - 12
  const year = now.getFullYear();

  if (month >= 4) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(-2)}`;
  }
};

// Helper to format MMYYYY string into standard readable format (e.g., "042025" -> "Apr 2025")
const formatPeriod = (periodStr) => {
  if (!periodStr || String(periodStr).length !== 6) return periodStr || "N/A";
  const str = String(periodStr);
  const monthStr = str.substring(0, 2);
  const yearStr = str.substring(2);

  const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
  return isNaN(date.getTime())
    ? periodStr
    : date.toLocaleString("en-IN", { month: "short", year: "numeric" });
};

const GstMonthlyRevenueSummary = () => {
  const [data, setData] = useState([]);
  const [fyOptions, setFyOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selected FY State (Defaults to current Indian FY)
  const [selectedFy, setSelectedFy] = useState(() => getCurrentFinancialYear());

  // Display Unit State: 'crores' | 'lakhs' | 'standard'
  const [displayUnit, setDisplayUnit] = useState("crores");

  // Fetch FY Dropdown list from backend GET /gst/return-3b/fin-year
  const loadFinancialYears = useCallback(async (signal) => {
    try {
      const response = await fetchFinancialYears(signal);
      
      // Extract array whether backend returns direct array or wrapped data
      const rawYears = Array.isArray(response) ? response : response?.data || [];
      
      if (Array.isArray(rawYears) && rawYears.length > 0) {
        // Sanitize item structures (handles string[] and object[])
        const normalizedYears = rawYears.map((fy) =>
          typeof fy === "object" && fy !== null ? fy.finYear || fy.financialYear || String(fy) : String(fy)
        );

        setFyOptions(normalizedYears);

        // Fallback to first available FY if currently selected FY is missing from backend response
        const currentFy = getCurrentFinancialYear();
        if (!normalizedYears.includes(currentFy) && !normalizedYears.includes(selectedFy)) {
          setSelectedFy(normalizedYears[0]);
        }
      } else {
        setFyOptions([]);
      }
    } catch (err) {
      console.error("Failed to load financial years:", err);
      setFyOptions([]);
    }
  }, [selectedFy]);

  // Fetch Summary Table Data filtered by backend String FY
  const loadSummaryData = useCallback(async (signal) => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchMonthlyRevenueSummary(selectedFy, signal);
      if (result !== null) {
        setData(Array.isArray(result) ? result : []);
      }
    } catch (err) {
      setError(
        err?.message || "Failed to fetch revenue summary data. Please try again later."
      );
    } finally {
      setLoading(false);
    }
  }, [selectedFy]);

  // Load FY Dropdown list on Component Mount
  useEffect(() => {
    const controller = new AbortController();
    loadFinancialYears(controller.signal);
    return () => controller.abort();
  }, [loadFinancialYears]);

  // Refetch Table Data whenever selectedFy changes
  useEffect(() => {
    const controller = new AbortController();
    loadSummaryData(controller.signal);
    return () => controller.abort();
  }, [loadSummaryData]);

  // Unit Scaler Currency Formatter
  const formatCurrency = useCallback(
    (val) => {
      const num = Number(val);
      if (isNaN(num) || val === null || val === undefined) return "₹0";

      if (displayUnit === "crores") {
        const inCrores = num / 10000000;
        return `₹${inCrores.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} Cr`;
      }

      if (displayUnit === "lakhs") {
        const inLakhs = num / 100000;
        return `₹${inLakhs.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} L`;
      }

      return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    },
    [displayUnit]
  );

  // Aggregated Totals Calculation over dataset
  const totals = useMemo(() => {
    return data.reduce(
      (acc, row) => ({
        taxableValue: acc.taxableValue + (Number(row.grossTaxableValue) || 0),
        grossRevenue: acc.grossRevenue + (Number(row.totalGrossRevenue) || 0),
        cashPaid: acc.cashPaid + (Number(row.totalCashCollection) || 0),
        itcUtilized: acc.itcUtilized + (Number(row.totalCreditUtilized) || 0),
        taxpayers: acc.taxpayers + (Number(row.totalTaxpayersFiled) || 0),
      }),
      { taxableValue: 0, grossRevenue: 0, cashPaid: 0, itcUtilized: 0, taxpayers: 0 }
    );
  }, [data]);

  const overallCashPct = totals.grossRevenue
    ? ((totals.cashPaid / totals.grossRevenue) * 100).toFixed(2)
    : "0.00";

  const overallItcPct = totals.grossRevenue
    ? ((totals.itcUtilized / totals.grossRevenue) * 100).toFixed(2)
    : "0.00";

  // CSV Export Handler
  const handleExport = () => {
    if (!data.length) return;
    const headers = [
      "Period",
      "Taxpayers Filed",
      "Gross Taxable Value",
      "Total Gross Revenue",
      "Cash Paid",
      "ITC Utilized",
      "Cash %",
      "ITC %",
    ];

    const rows = data.map((row) => [
      row.retPeriod,
      row.totalTaxpayersFiled || 0,
      row.grossTaxableValue || 0,
      row.totalGrossRevenue || 0,
      row.totalCashCollection || 0,
      row.totalCreditUtilized || 0,
      `${row.cashRealizationPct || 0}%`,
      `${row.itcUtilizationPct || 0}%`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `GSTR3B_Revenue_Summary_${selectedFy}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="container-fluid p-0 animate-fade-in">
      {/* INJECTED ANIMATION STYLES */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-fade-in {
          animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-card {
          animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-row {
          animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .spin-icon {
          animation: spin 1s linear infinite;
        }
      `}</style>

      {/* STICKY HEADER SECTION */}
      <header
        className="bg-white border-bottom mb-4 sticky-top shadow-sm"
        style={{ zIndex: 1000 }}
      >
        <div className="container-fluid px-2 px-sm-3 px-lg-4 py-2 py-sm-3">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-stretch align-items-md-center gap-2 gap-md-3">
            <div className="d-flex align-items-center gap-2">
              <div
                className="bg-primary text-white rounded-2 d-flex align-items-center justify-content-center shadow-sm flex-shrink-0"
                style={{ width: 36, height: 36 }}
              >
                <BarChart3 size={20} />
              </div>
              <h5 className="mb-0 fw-bold text-dark text-truncate">
                GSTR-3B Revenue Summary
              </h5>
            </div>

            {/* Controls Bar */}
            <div className="d-flex flex-wrap align-items-center justify-content-between justify-content-md-end gap-2 w-100 w-md-auto">
              
              {/* MEDIUM SIZED DYNAMIC FY DROPDOWN */}
              <div 
                className="input-group input-group-md flex-grow-0" 
                style={{ minWidth: "160px", maxWidth: "220px" }}
              >
                <span className="input-group-text bg-light border-end-0 px-2 text-secondary">
                  <Calendar size={15} />
                </span>
                <select
                  aria-label="Select Financial Year"
                  className="form-select border-start-0 rounded-end fw-semibold text-dark py-1 pe-4"
                  value={selectedFy}
                  onChange={(e) => setSelectedFy(e.target.value)}
                  style={{ 
                    fontSize: "0.85rem", 
                    height: "34px", 
                    cursor: "pointer" 
                  }}
                >
                  <option value="ALL">All Financial Years</option>
                  {fyOptions.length > 0 ? (
                    fyOptions.map((fy) => (
                      <option key={fy} value={fy}>
                        FY {fy}
                      </option>
                    ))
                  ) : (
                    <option value={selectedFy} disabled>
                      {selectedFy ? `FY ${selectedFy}` : "No FY Available"}
                    </option>
                  )}
                </select>
              </div>

              {/* Amount Unit Switcher */}
              <div className="btn-group btn-group-sm flex-grow-1 flex-sm-grow-0" role="group">
                <button
                  type="button"
                  className={`btn py-1 px-2 ${displayUnit === "crores" ? "btn-primary fw-semibold" : "btn-outline-secondary bg-white"}`}
                  style={{ fontSize: "0.8rem", height: "34px" }}
                  onClick={() => setDisplayUnit("crores")}
                >
                  Cr
                </button>
                <button
                  type="button"
                  className={`btn py-1 px-2 ${displayUnit === "lakhs" ? "btn-primary fw-semibold" : "btn-outline-secondary bg-white"}`}
                  style={{ fontSize: "0.8rem", height: "34px" }}
                  onClick={() => setDisplayUnit("lakhs")}
                >
                  Lakhs
                </button>
                <button
                  type="button"
                  className={`btn py-1 px-2 ${displayUnit === "standard" ? "btn-primary fw-semibold" : "btn-outline-secondary bg-white"}`}
                  style={{ fontSize: "0.8rem", height: "34px" }}
                  onClick={() => setDisplayUnit("standard")}
                >
                  Abs
                </button>
              </div>

              {/* Action Buttons */}
              <div className="d-flex align-items-center gap-2 flex-grow-1 flex-sm-grow-0 justify-content-end">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success rounded-2 d-flex align-items-center justify-content-center gap-1 shadow-sm flex-grow-1 flex-sm-grow-0 px-2"
                  style={{ fontSize: "0.8rem", height: "34px" }}
                  disabled={loading || data.length === 0}
                  onClick={handleExport}
                >
                  <Download size={14} />
                  <span className="d-none d-sm-inline">Export</span>
                </button>

                <button
                  type="button"
                  className="btn btn-sm btn-primary rounded-2 d-flex align-items-center justify-content-center gap-1 shadow-sm flex-grow-1 flex-sm-grow-0 px-2"
                  style={{ fontSize: "0.8rem", height: "34px" }}
                  disabled={loading}
                  onClick={() => {
                    loadFinancialYears();
                    loadSummaryData();
                  }}
                >
                  <RefreshCw size={14} className={loading ? "spin-icon" : ""} />
                  <span className="d-none d-sm-inline">Refresh</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ERROR DISPLAY */}
      {error && (
        <div className="alert alert-danger mx-2 mx-sm-3 d-flex align-items-center justify-content-between rounded-3 shadow-sm border-0 p-3 animate-fade-in" role="alert">
          <div className="small">{error}</div>
          <button className="btn btn-outline-danger btn-sm text-nowrap ms-2" onClick={() => loadSummaryData()}>
            Retry
          </button>
        </div>
      )}

      {/* KPI METRIC CARDS */}
      <div className="px-2 px-sm-3 px-lg-4">
        <div className="row g-2 g-sm-3 mb-4">
          <div className="col-12 col-sm-6 col-xl-3 animate-card" style={{ animationDelay: "50ms" }}>
            <div className="card border-0 shadow-sm rounded-3 h-100 bg-white border-start border-4 border-secondary">
              <div className="card-body p-3">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="text-uppercase text-muted fw-bold" style={{ fontSize: "0.7rem", letterSpacing: "0.5px" }}>
                    Gross Taxable Value
                  </span>
                  <div className="bg-light p-2 rounded-circle text-secondary">
                    <Briefcase size={16} />
                  </div>
                </div>
                <h4 className="fw-bold text-dark mb-1 font-monospace text-truncate">{formatCurrency(totals.taxableValue)}</h4>
                <span className="text-muted small">Base tax computation value</span>
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3 animate-card" style={{ animationDelay: "100ms" }}>
            <div className="card border-0 shadow-sm rounded-3 h-100 bg-white border-start border-4 border-success">
              <div className="card-body p-3">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="text-uppercase text-muted fw-bold" style={{ fontSize: "0.7rem", letterSpacing: "0.5px" }}>
                    Total Gross Revenue
                  </span>
                  <div className="bg-success-subtle p-2 rounded-circle text-success">
                    <IndianRupee size={16} />
                  </div>
                </div>
                <h4 className="fw-bold text-success mb-1 font-monospace text-truncate">{formatCurrency(totals.grossRevenue)}</h4>
                <span className="text-muted small">Total tax liability (Cash + ITC)</span>
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3 animate-card" style={{ animationDelay: "150ms" }}>
            <div className="card border-0 shadow-sm rounded-3 h-100 bg-white border-start border-4 border-primary">
              <div className="card-body p-3">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="text-uppercase text-muted fw-bold" style={{ fontSize: "0.7rem", letterSpacing: "0.5px" }}>
                    Cash Realization
                  </span>
                  <span className="badge bg-primary-subtle text-primary rounded-pill font-monospace fw-bold">
                    {overallCashPct}%
                  </span>
                </div>
                <h4 className="fw-bold text-primary mb-1 font-monospace text-truncate">{formatCurrency(totals.cashPaid)}</h4>
                <span className="text-muted small">Direct Treasury Cash Collections</span>
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3 animate-card" style={{ animationDelay: "200ms" }}>
            <div className="card border-0 shadow-sm rounded-3 h-100 bg-white border-start border-4" style={{ borderColor: "#6f42c1" }}>
              <div className="card-body p-3">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="text-uppercase text-muted fw-bold" style={{ fontSize: "0.7rem", letterSpacing: "0.5px" }}>
                    ITC Utilized
                  </span>
                  <span className="badge rounded-pill font-monospace fw-bold" style={{ backgroundColor: "#f3ebf9", color: "#6f42c1" }}>
                    {overallItcPct}%
                  </span>
                </div>
                <h4 className="fw-bold mb-1 font-monospace text-truncate" style={{ color: "#6f42c1" }}>
                  {formatCurrency(totals.itcUtilized)}
                </h4>
                <span className="text-muted small">Adjusted via Input Credit</span>
              </div>
            </div>
          </div>
        </div>

        {/* DATA TABLE CONTAINER */}
        <div className="card border-0 shadow-sm rounded-3 overflow-hidden bg-white mb-4 animate-card" style={{ animationDelay: "250ms" }}>
          <div className="card-header bg-white border-bottom py-3 px-3 px-sm-4 d-flex flex-row justify-content-between align-items-center gap-2">
            <h6 className="fw-bold text-dark mb-0 text-truncate">Monthly Revenue Breakdown</h6>
            <span className="badge bg-light text-secondary border font-monospace text-nowrap">
              Unit: {displayUnit === "crores" ? "₹ Cr" : displayUnit === "lakhs" ? "₹ Lakhs" : "₹ Abs"}
            </span>
          </div>

          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" style={{ fontSize: "0.85rem", minWidth: "750px" }}>
              <thead className="table-dark text-uppercase border-bottom" style={{ fontSize: "0.7rem", letterSpacing: "0.5px" }}>
                <tr>
                  <th className="py-3 px-3 border-0">Period</th>
                  <th className="py-3 px-2 border-0 text-end">Taxpayers</th>
                  <th className="py-3 px-2 border-0 text-end">Taxable Value</th>
                  <th className="py-3 px-2 border-0 text-end">Gross Revenue</th>
                  <th className="py-3 px-2 border-0 text-end">Cash Paid</th>
                  <th className="py-3 px-2 border-0 text-end">ITC Utilized</th>
                  <th className="py-3 px-2 border-0 text-end">Cash %</th>
                  <th className="py-3 px-3 border-0 text-end">ITC %</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="text-center py-5">
                      <div className="spinner-border text-primary" role="status" style={{ width: "2rem", height: "2rem" }}>
                        <span className="visually-hidden">Loading...</span>
                      </div>
                      <p className="mt-2 text-secondary fw-semibold small mb-0">Loading revenue analytics...</p>
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center py-5 text-muted">
                      No revenue data available for Financial Year <strong>{selectedFy}</strong>.
                    </td>
                  </tr>
                ) : (
                  data.map((row, idx) => {
                    const cashPct = Number(row.cashRealizationPct) || 0;
                    const itcPct = Number(row.itcUtilizationPct) || 0;

                    return (
                      <tr 
                        key={row.retPeriod} 
                        className="animate-row"
                        style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
                      >
                        <td className="px-3 fw-bold text-dark bg-light-subtle text-nowrap">
                          <span className="badge bg-dark text-white border me-1 me-sm-2 font-monospace px-1 px-sm-2 py-1">
                            {row.retPeriod}
                          </span>
                          <span className="d-none d-sm-inline">{formatPeriod(row.retPeriod)}</span>
                        </td>
                        <td className="px-2 text-end font-monospace fw-semibold text-secondary">
                          {Number(row.totalTaxpayersFiled || 0).toLocaleString("en-IN")}
                        </td>
                        <td className="px-2 text-end font-monospace fw-semibold text-dark text-nowrap">
                          {formatCurrency(row.grossTaxableValue)}
                        </td>
                        <td className="px-2 text-end font-monospace fw-bold text-success text-nowrap" style={{ backgroundColor: "#f2faf5" }}>
                          {formatCurrency(row.totalGrossRevenue)}
                        </td>
                        <td className="px-2 text-end font-monospace fw-bold text-primary text-nowrap" style={{ backgroundColor: "#f0f7ff" }}>
                          {formatCurrency(row.totalCashCollection)}
                        </td>
                        <td className="px-2 text-end font-monospace fw-bold text-nowrap" style={{ color: "#6f42c1", backgroundColor: "#fbf8ff" }}>
                          {formatCurrency(row.totalCreditUtilized)}
                        </td>
                        <td className="px-2 text-end font-monospace" style={{ backgroundColor: "#f0f7ff" }}>
                          <span className="badge bg-primary text-white border shadow-sm px-1 px-sm-2 py-1">
                            {cashPct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-3 text-end font-monospace" style={{ backgroundColor: "#fbf8ff" }}>
                          <span className="badge text-white border shadow-sm px-1 px-sm-2 py-1" style={{ backgroundColor: "#6f42c1" }}>
                            {itcPct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {!loading && data.length > 0 && (
                <tfoot className="table-dark fw-bold border-top animate-row" style={{ animationDelay: "320ms" }}>
                  <tr>
                    <td className="px-3 py-3 text-uppercase text-white text-nowrap">Total</td>
                    <td className="px-2 py-3 text-end font-monospace text-light">
                      {totals.taxpayers.toLocaleString("en-IN")}
                    </td>
                    <td className="px-2 py-3 text-end font-monospace text-light text-nowrap">{formatCurrency(totals.taxableValue)}</td>
                    <td className="px-2 py-3 text-end font-monospace text-warning text-nowrap">{formatCurrency(totals.grossRevenue)}</td>
                    <td className="px-2 py-3 text-end font-monospace text-info text-nowrap">{formatCurrency(totals.cashPaid)}</td>
                    <td className="px-2 py-3 text-end font-monospace text-nowrap" style={{ color: "#d8b4fe" }}>
                      {formatCurrency(totals.itcUtilized)}
                    </td>
                    <td className="px-2 py-3 text-end font-monospace">
                      <span className="badge bg-info text-dark fw-bold">{overallCashPct}%</span>
                    </td>
                    <td className="px-3 py-3 text-end font-monospace">
                      <span className="badge text-white fw-bold" style={{ backgroundColor: "#9333ea" }}>{overallItcPct}%</span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GstMonthlyRevenueSummary;