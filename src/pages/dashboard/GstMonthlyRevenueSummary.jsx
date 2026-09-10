import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertTriangle,
  BarChart3,
  Briefcase,
  Calendar,
  Download,
  IndianRupee,
  Loader2,
  PieChart,
  RefreshCw,
  Wallet,
} from "lucide-react";

import {
  fetchFinancialYears,
  fetchMonthlyRevenueSummary,
} from "../../services/dashboardService";

import "./GstMonthlyRevenueSummary.css";

/* =========================================================
   HELPERS
========================================================= */

const getCurrentFinancialYear = () => {
  const now = new Date();

  const month = now.getMonth() + 1;

  const year = now.getFullYear();

  if (month >= 4) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  }

  return `${year - 1}-${year.toString().slice(-2)}`;
};

const formatPeriod = (periodStr) => {
  if (!periodStr || String(periodStr).length !== 6) {
    return periodStr || "N/A";
  }

  const str = String(periodStr);

  const monthStr = str.substring(0, 2);

  const yearStr = str.substring(2);

  const date = new Date(
    parseInt(yearStr, 10),
    parseInt(monthStr, 10) - 1,
    1
  );

  return isNaN(date.getTime())
    ? periodStr
    : date.toLocaleString("en-IN", { month: "short", year: "numeric" });
};

const toNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const formatNumber = (value) =>
  new Intl.NumberFormat("en-IN").format(toNumber(value));

/* =========================================================
   LOADING BAR
========================================================= */

const TopLoadingBar = React.memo(({ active }) => {
  if (!active) {
    return null;
  }

  return (
    <div className="gst-loading-bar">
      <div className="gst-loading-bar-progress" />
    </div>
  );
});

/* =========================================================
   KPI CARD
========================================================= */

const KPI_THEMES = {
  neutral: {
    background: "#f4f6f9",
    border: "#dfe4ea",
    accent: "#475569",
    iconBackground: "#475569",
    valueColor: "#1f2937",
    subtitleColor: "#64748b",
  },

  success: {
    background: "#f0fdf4",
    border: "#bbf7d0",
    accent: "#16a34a",
    iconBackground: "#16a34a",
    valueColor: "#166534",
    subtitleColor: "#52675a",
  },

  primary: {
    background: "#eef4ff",
    border: "#c7d7fe",
    accent: "#2563eb",
    iconBackground: "#2563eb",
    valueColor: "#123b63",
    subtitleColor: "#52657a",
  },

  purple: {
    background: "#f5f0ff",
    border: "#e0d0fb",
    accent: "#6f42c1",
    iconBackground: "#6f42c1",
    valueColor: "#553c9a",
    subtitleColor: "#6f6480",
  },
};

const KpiCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "primary",
  loading = false,
}) => {
  const theme = KPI_THEMES[variant] || KPI_THEMES.primary;

  return (
    <div
      className="gst-kpi-card"
      style={{
        "--kpi-bg": theme.background,
        "--kpi-border": theme.border,
        "--kpi-accent": theme.accent,
        "--kpi-icon-bg": theme.iconBackground,
        "--kpi-value": theme.valueColor,
        "--kpi-subtitle": theme.subtitleColor,
      }}
    >
      <div className="gst-kpi-card-body">
        <div className="gst-kpi-accent-bar" />

        <div className="gst-kpi-icon">
          {loading ? (
            <Loader2 size={18} className="spin" />
          ) : (
            <Icon size={18} strokeWidth={2.2} />
          )}
        </div>

        <div className="gst-kpi-content">
          <div className="gst-kpi-title">{title}</div>

          {loading ? (
            <div className="gst-kpi-loading-value">Loading...</div>
          ) : (
            <div className="gst-kpi-value" title={String(value)}>
              {value}
            </div>
          )}

          <div className="gst-kpi-subtitle" title={subtitle}>
            {subtitle}
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   SKELETON ROW
========================================================= */

const SkeletonRow = React.memo(() => (
  <tr className="skeleton-row">
    <td className="ps-3">
      <span className="placeholder-glow d-inline-block w-75">
        <span className="placeholder col-12 rounded-1" style={{ height: 14 }} />
      </span>
    </td>

    {Array.from({ length: 7 }).map((_, index) => (
      <td key={index} className="text-end">
        <span className="placeholder-glow d-inline-block w-75">
          <span className="placeholder col-12 rounded-1" style={{ height: 14 }} />
        </span>
      </td>
    ))}
  </tr>
));

/* =========================================================
   MAIN COMPONENT
========================================================= */

const GstMonthlyRevenueSummary = () => {
  const [data, setData] = useState([]);

  const [fyOptions, setFyOptions] = useState([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  const [selectedFy, setSelectedFy] = useState(() =>
    getCurrentFinancialYear()
  );

  const [displayUnit, setDisplayUnit] = useState("crores");

  /* =====================================================
     FINANCIAL YEARS
  ===================================================== */

  const loadFinancialYears = useCallback(
    async (signal) => {
      try {
        const response = await fetchFinancialYears(signal);

        const rawYears = Array.isArray(response)
          ? response
          : response?.data || [];

        if (Array.isArray(rawYears) && rawYears.length > 0) {
          const normalizedYears = rawYears.map((fy) =>
            typeof fy === "object" && fy !== null
              ? fy.finYear || fy.financialYear || String(fy)
              : String(fy)
          );

          setFyOptions(normalizedYears);

          const currentFy = getCurrentFinancialYear();

          if (
            !normalizedYears.includes(currentFy) &&
            !normalizedYears.includes(selectedFy)
          ) {
            setSelectedFy(normalizedYears[0]);
          }
        } else {
          setFyOptions([]);
        }
      } catch (err) {
        console.error("Failed to load financial years:", err);

        setFyOptions([]);
      }
    },
    [selectedFy]
  );

  /* =====================================================
     SUMMARY DATA
  ===================================================== */

  const loadSummaryData = useCallback(
    async (signal) => {
      try {
        setLoading(true);
        setError(null);

        const result = await fetchMonthlyRevenueSummary(selectedFy, signal);

        if (result !== null) {
          setData(Array.isArray(result) ? result : []);
        }
      } catch (err) {
        setError(
          err?.message ||
            "Failed to fetch revenue summary data. Please try again later."
        );
      } finally {
        setLoading(false);
      }
    },
    [selectedFy]
  );

  useEffect(() => {
    const controller = new AbortController();

    loadFinancialYears(controller.signal);

    return () => controller.abort();
  }, [loadFinancialYears]);

  useEffect(() => {
    const controller = new AbortController();

    loadSummaryData(controller.signal);

    return () => controller.abort();
  }, [loadSummaryData]);

  /* =====================================================
     CURRENCY FORMATTER
  ===================================================== */

  const formatCurrency = useCallback(
    (val) => {
      const num = Number(val);

      if (isNaN(num) || val === null || val === undefined) {
        return "₹0";
      }

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

  /* =====================================================
     TOTALS
  ===================================================== */

  const totals = useMemo(
    () =>
      data.reduce(
        (acc, row) => ({
          taxableValue:
            acc.taxableValue + toNumber(row.grossTaxableValue),
          grossRevenue:
            acc.grossRevenue + toNumber(row.totalGrossRevenue),
          cashPaid: acc.cashPaid + toNumber(row.totalCashCollection),
          itcUtilized:
            acc.itcUtilized + toNumber(row.totalCreditUtilized),
          taxpayers: acc.taxpayers + toNumber(row.totalTaxpayersFiled),
        }),
        {
          taxableValue: 0,
          grossRevenue: 0,
          cashPaid: 0,
          itcUtilized: 0,
          taxpayers: 0,
        }
      ),
    [data]
  );

  const overallCashPct = totals.grossRevenue
    ? ((totals.cashPaid / totals.grossRevenue) * 100).toFixed(2)
    : "0.00";

  const overallItcPct = totals.grossRevenue
    ? ((totals.itcUtilized / totals.grossRevenue) * 100).toFixed(2)
    : "0.00";

  /* =====================================================
     EXPORT
  ===================================================== */

  const handleExport = () => {
    if (!data.length) {
      return;
    }

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
      [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);

    const link = document.createElement("a");

    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `GSTR3B_Revenue_Summary_${selectedFy}.csv`
    );

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* =====================================================
     UI
  ===================================================== */

  return (
    <div className="gst-revenue-dashboard min-vh-100">
      {/* =================================================
          OFFICE HEADER
      ================================================= */}

      <header className="gst-office-header bg-white border-bottom">
        <div className="container-fluid px-3 px-lg-4 py-3">
          <div className="d-flex flex-column flex-xl-row justify-content-between align-items-start align-items-xl-center gap-3">
            <div>
              <div className="d-flex align-items-center gap-2">
                <div className="gst-header-icon">
                  <BarChart3 size={20} />
                </div>

                <div>
                  <h5 className="fw-bold text-dark mb-0 text-truncate">
                    GSTR-3B Revenue Summary
                  </h5>
                </div>
              </div>
            </div>

            <div className="d-flex flex-wrap align-items-center justify-content-end gap-2 w-100 w-xl-auto">
              <div
                className="input-group input-group-sm"
                style={{ width: "190px" }}
              >
                <span className="input-group-text bg-white">
                  <Calendar size={15} className="text-primary" />
                </span>

                <select
                  aria-label="Select Financial Year"
                  className="form-select fw-semibold"
                  value={selectedFy}
                  onChange={(event) => setSelectedFy(event.target.value)}
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

              <div className="btn-group btn-group-sm" role="group">
                <button
                  type="button"
                  className={`btn ${
                    displayUnit === "crores"
                      ? "btn-primary"
                      : "btn-outline-secondary bg-white"
                  }`}
                  onClick={() => setDisplayUnit("crores")}
                >
                  Cr
                </button>

                <button
                  type="button"
                  className={`btn ${
                    displayUnit === "lakhs"
                      ? "btn-primary"
                      : "btn-outline-secondary bg-white"
                  }`}
                  onClick={() => setDisplayUnit("lakhs")}
                >
                  Lakhs
                </button>

                <button
                  type="button"
                  className={`btn ${
                    displayUnit === "standard"
                      ? "btn-primary"
                      : "btn-outline-secondary bg-white"
                  }`}
                  onClick={() => setDisplayUnit("standard")}
                >
                  Abs
                </button>
              </div>

              <button
                type="button"
                className="btn btn-outline-success rounded-2 d-flex align-items-center justify-content-center gap-2"
                disabled={loading || data.length === 0}
                onClick={handleExport}
              >
                <Download size={15} />
                Export
              </button>

              <button
                type="button"
                className="btn btn-primary rounded-2 d-flex align-items-center justify-content-center gap-2"
                disabled={loading}
                onClick={() => {
                  loadFinancialYears();
                  loadSummaryData();
                }}
              >
                <RefreshCw size={15} className={loading ? "spin" : ""} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <TopLoadingBar active={loading} />
      </header>

      <main className="container-fluid px-3 px-lg-4 py-4">
        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <div className="alert alert-danger shadow-sm d-flex align-items-start gap-2 rounded-3">
            <AlertTriangle size={18} className="mt-1" />

            <div className="flex-grow-1">
              <div className="fw-bold">Unable to load revenue summary</div>

              <div className="small">{error}</div>
            </div>

            <button
              type="button"
              className="btn btn-outline-danger btn-sm text-nowrap"
              onClick={() => loadSummaryData()}
            >
              Retry
            </button>
          </div>
        )}

        {/* =================================================
            LOADING
        ================================================= */}

        {loading && (
          <div className="alert alert-info shadow-sm d-flex align-items-center gap-2 rounded-3 py-2">
            <Loader2 size={16} className="spin" />

            <div className="small fw-semibold">
              Loading revenue analytics...
            </div>
          </div>
        )}

        {/* =========================================================
            KPI GRID
        ========================================================= */}

        <div className="px-2 px-sm-3 px-lg-4">
          <div className="row g-3 mb-4">
            <div className="col-12 col-sm-6 col-xl-3">
              <KpiCard
                title="Gross Taxable Value"
                value={formatCurrency(totals.taxableValue)}
                subtitle="Base tax computation value"
                icon={Briefcase}
                variant="neutral"
                loading={loading}
              />
            </div>

            <div className="col-12 col-sm-6 col-xl-3">
              <KpiCard
                title="Total Gross Revenue"
                value={formatCurrency(totals.grossRevenue)}
                subtitle="Total tax liability (Cash + ITC)"
                icon={IndianRupee}
                variant="success"
                loading={loading}
              />
            </div>

            <div className="col-12 col-sm-6 col-xl-3">
              <KpiCard
                title="Cash Realization"
                value={formatCurrency(totals.cashPaid)}
                subtitle={`${overallCashPct}% of gross revenue`}
                icon={Wallet}
                variant="primary"
                loading={loading}
              />
            </div>

            <div className="col-12 col-sm-6 col-xl-3">
              <KpiCard
                title="ITC Utilized"
                value={formatCurrency(totals.itcUtilized)}
                subtitle={`${overallItcPct}% of gross revenue`}
                icon={PieChart}
                variant="purple"
                loading={loading}
              />
            </div>
          </div>
        </div>

        {/* =================================================
            REVENUE TABLE
        ================================================= */}

        <section className="card border-0 shadow-sm rounded-3 overflow-hidden">
          <div className="card-header bg-white border-bottom p-3 d-flex align-items-center justify-content-between gap-2">
            <h5 className="fw-bold text-dark mb-0 text-truncate">
              Monthly Revenue Breakdown
            </h5>

            <span className="badge bg-light text-secondary border font-monospace text-nowrap">
              Unit:{" "}
              {displayUnit === "crores"
                ? "₹ Cr"
                : displayUnit === "lakhs"
                ? "₹ Lakhs"
                : "₹ Abs"}
            </span>
          </div>

          <div className="table-responsive gst-table-wrapper">
            <table className="table table-hover align-middle mb-0 gst-office-table">
              <thead>
                <tr className="official-table-header">
                  <th className="text-center period-column">Period</th>

                  <th className="text-center amount-column">Taxpayers</th>

                  <th className="text-center amount-column">
                    Taxable Value
                  </th>

                  <th className="text-center amount-column">
                    Gross Revenue
                  </th>

                  <th className="text-center amount-column">Cash Paid</th>

                  <th className="text-center amount-column">
                    ITC Utilized
                  </th>

                  <th className="text-center ratio-column">Cash %</th>

                  <th className="text-center ratio-column">ITC %</th>
                </tr>
              </thead>

              <tbody>
                {loading && data.length === 0 ? (
                  Array.from({ length: 8 }).map((_, index) => (
                    <SkeletonRow key={`skeleton-${index}`} />
                  ))
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="gst-empty-cell">
                      <div className="gst-empty-state">
                        <div className="empty-state-icon">
                          <BarChart3 size={25} />
                        </div>

                        <div className="empty-state-title">
                          No revenue data found
                        </div>

                        <div className="empty-state-description">
                          No revenue records are available for financial
                          year <strong>{selectedFy}</strong>.
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((row) => {
                    const cashPct = toNumber(row.cashRealizationPct);

                    const itcPct = toNumber(row.itcUtilizationPct);

                    return (
                      <tr key={row.retPeriod} className="gst-data-row">
                        <td className="taxpayer-cell text-center">
                          <div className="gstin-value">{row.retPeriod}</div>

                          <div className="period-value">
                            {formatPeriod(row.retPeriod)}
                          </div>
                        </td>

                        <td className="amount-cell text-end">
                          {formatNumber(row.totalTaxpayersFiled)}
                        </td>

                        <td className="amount-cell text-end">
                          {formatCurrency(row.grossTaxableValue)}
                        </td>

                        <td className="amount-cell text-end">
                          {formatCurrency(row.totalGrossRevenue)}
                        </td>

                        <td className="amount-cell text-end">
                          {formatCurrency(row.totalCashCollection)}
                        </td>

                        <td className="amount-cell text-end">
                          {formatCurrency(row.totalCreditUtilized)}
                        </td>

                        <td className="ratio-cell text-center">
                          <span className="percent-badge percent-badge-cash">
                            {cashPct.toFixed(1)}%
                          </span>
                        </td>

                        <td className="ratio-cell text-center">
                          <span className="percent-badge percent-badge-itc">
                            {itcPct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {!loading && data.length > 0 && (
                <tfoot>
                  <tr className="gst-totals-row">
                    <td className="taxpayer-cell text-center">Total</td>

                    <td className="amount-cell text-end">
                      {formatNumber(totals.taxpayers)}
                    </td>

                    <td className="amount-cell text-end">
                      {formatCurrency(totals.taxableValue)}
                    </td>

                    <td className="amount-cell text-end">
                      {formatCurrency(totals.grossRevenue)}
                    </td>

                    <td className="amount-cell text-end">
                      {formatCurrency(totals.cashPaid)}
                    </td>

                    <td className="amount-cell text-end">
                      {formatCurrency(totals.itcUtilized)}
                    </td>

                    <td className="ratio-cell text-center">
                      <span className="percent-badge percent-badge-cash">
                        {overallCashPct}%
                      </span>
                    </td>

                    <td className="ratio-cell text-center">
                      <span className="percent-badge percent-badge-itc">
                        {overallItcPct}%
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};

export default GstMonthlyRevenueSummary;
