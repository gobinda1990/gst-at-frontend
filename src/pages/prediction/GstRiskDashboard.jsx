
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  FileSpreadsheet,
  FilterX,
  IndianRupee,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  TrendingUp,
  X,
} from "lucide-react";

import {
  fetchAllReturnPeriods,
  fetchGstRiskSummary,
} from "../../services/gstDashboardApi";

/* ============================================================================
 * CONSTANTS
 * ========================================================================== */

const DEFAULT_PAGE_SIZE = 10;

const PAGE_SIZE_OPTIONS = Object.freeze([10, 25, 50, 100]);

const RISK_CATEGORY = Object.freeze({
  ALL: "ALL",
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
});

const RISK_THRESHOLD = Object.freeze({
  CRITICAL_SCORE: 0.85,
  HIGH_SCORE: 0.65,
  CRITICAL_EXCESS_ITC: 100000,
});

const TABLE_MIN_WIDTH = 1200;

/* ============================================================================
 * FORMATTERS
 * ========================================================================== */

const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const NUMBER_FORMATTER = new Intl.NumberFormat("en-IN");

const safeNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
};

const formatCurrency = (value) =>
  INR_FORMATTER.format(safeNumber(value));

const formatNumber = (value) =>
  NUMBER_FORMATTER.format(safeNumber(value));

const formatCompactCurrency = (value) => {
  const number = safeNumber(value);

  const absolute = Math.abs(number);

  if (absolute >= 10000000) {
    return `₹${(number / 10000000).toFixed(2)} Cr`;
  }

  if (absolute >= 100000) {
    return `₹${(number / 100000).toFixed(2)} L`;
  }

  if (absolute >= 1000) {
    return `₹${(number / 1000).toFixed(1)} K`;
  }

  return formatCurrency(number);
};

const getRiskScorePercent = (value) => {
  const score = safeNumber(value);

  if (score <= 1) {
    return Math.max(0, Math.min(score * 100, 100));
  }

  return Math.max(0, Math.min(score, 100));
};

const formatRiskScore = (value) =>
  `${getRiskScorePercent(value).toFixed(0)}%`;

const escapeCsvValue = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);

  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n") ||
    stringValue.includes("\r")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

/* ============================================================================
 * RISK CLASSIFICATION
 * ========================================================================== */

const classifyRisk = (row) => {
  const xgbRiskScore = safeNumber(row?.xgbRiskScore);
  const excessItc = safeNumber(row?.excessItc);

  if (
    xgbRiskScore >= RISK_THRESHOLD.CRITICAL_SCORE ||
    excessItc > RISK_THRESHOLD.CRITICAL_EXCESS_ITC
  ) {
    return RISK_CATEGORY.CRITICAL;
  }

  if (xgbRiskScore >= RISK_THRESHOLD.HIGH_SCORE) {
    return RISK_CATEGORY.HIGH;
  }

  return RISK_CATEGORY.MEDIUM;
};

const processRecord = (row) => ({
  ...row,
  xgbRiskScore: safeNumber(row?.xgbRiskScore),
  excessItc: safeNumber(row?.excessItc),
  taxableValue: safeNumber(row?.taxableValue),
  totalOutputTax: safeNumber(row?.totalOutputTax),
  cashTaxPaid: safeNumber(row?.cashTaxPaid),
  utilizedItc: safeNumber(row?.utilizedItc),
  itcUtilizationRatio:
    row?.itcUtilizationRatio === null ||
      row?.itcUtilizationRatio === undefined
      ? null
      : safeNumber(row.itcUtilizationRatio),
  filingDelayDays: safeNumber(row?.filingDelayDays),
  riskCategory: classifyRisk(row),
});

/* ============================================================================
 * COMPONENT
 * ========================================================================== */

export default function GstRiskDashboardBootstrap() {
  /* --------------------------------------------------------------------------
   * STATE
   * ------------------------------------------------------------------------ */

  const [periodOptions, setPeriodOptions] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState("");

  const [records, setRecords] = useState([]);

  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [loadingData, setLoadingData] = useState(false);

  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(
    RISK_CATEGORY.ALL
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const dataRequestControllerRef = useRef(null);

  /* --------------------------------------------------------------------------
   * LOAD RETURN PERIODS
   * ------------------------------------------------------------------------ */

  useEffect(() => {
    const controller = new AbortController();

    const loadPeriods = async () => {
      setLoadingPeriods(true);
      setError(null);

      try {
        const periods = await fetchAllReturnPeriods({
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        if (Array.isArray(periods) && periods.length > 0) {
          setPeriodOptions(periods);
          setSelectedPeriod(periods[0]?.value || "");
        } else {
          setPeriodOptions([]);
          setSelectedPeriod("");
        }
      } catch (err) {
        if (
          err?.name !== "CanceledError" &&
          err?.name !== "AbortError"
        ) {
          setError("Failed to load return periods.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingPeriods(false);
        }
      }
    };

    loadPeriods();

    return () => controller.abort();
  }, []);

  /* --------------------------------------------------------------------------
   * LOAD PERIOD DATA
   * ------------------------------------------------------------------------ */

  const loadPeriodData = useCallback(async (period) => {
    if (!period) {
      setRecords([]);
      return;
    }

    if (dataRequestControllerRef.current) {
      dataRequestControllerRef.current.abort();
    }

    const controller = new AbortController();

    dataRequestControllerRef.current = controller;

    setLoadingData(true);
    setError(null);

    try {
      const data = await fetchGstRiskSummary({
        retPeriod: period,
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return;
      }

      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      if (
        err?.name === "CanceledError" ||
        err?.name === "AbortError"
      ) {
        return;
      }

      setRecords([]);

      setError(
        err?.message ||
        "Error fetching GSTR-3B risk summary."
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoadingData(false);
      }
    }
  }, []);

  /* --------------------------------------------------------------------------
   * PERIOD CHANGE
   * ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!selectedPeriod) {
      return;
    }

    loadPeriodData(selectedPeriod);
  }, [selectedPeriod, loadPeriodData]);

  /* --------------------------------------------------------------------------
   * CLEANUP
   * ------------------------------------------------------------------------ */

  useEffect(() => {
    return () => {
      if (dataRequestControllerRef.current) {
        dataRequestControllerRef.current.abort();
      }
    };
  }, []);

  /* --------------------------------------------------------------------------
   * REFRESH
   * ------------------------------------------------------------------------ */

  const handleRefresh = useCallback(() => {
    if (!selectedPeriod || loadingData) {
      return;
    }

    loadPeriodData(selectedPeriod);
  }, [
    selectedPeriod,
    loadingData,
    loadPeriodData,
  ]);

  /* --------------------------------------------------------------------------
   * RESET PAGINATION
   * ------------------------------------------------------------------------ */

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    selectedCategory,
    selectedPeriod,
    pageSize,
  ]);

  /* --------------------------------------------------------------------------
   * PROCESSED DATA
   * ------------------------------------------------------------------------ */

  const processedRecords = useMemo(() => {
    if (!Array.isArray(records) || records.length === 0) {
      return [];
    }

    return records.map(processRecord);
  }, [records]);

  /* --------------------------------------------------------------------------
   * FILTER + SORT
   * ------------------------------------------------------------------------ */

  const filteredData = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    const filtered = processedRecords.filter((item) => {
      const gstin = String(item?.gstin || "").toLowerCase();

      const matchesSearch =
        !search || gstin.includes(search);

      const matchesCategory =
        selectedCategory === RISK_CATEGORY.ALL ||
        item.riskCategory === selectedCategory;

      return matchesSearch && matchesCategory;
    });

    return filtered.sort((a, b) => {
      const riskDifference =
        b.xgbRiskScore - a.xgbRiskScore;

      if (riskDifference !== 0) {
        return riskDifference;
      }

      return b.excessItc - a.excessItc;
    });
  }, [
    processedRecords,
    searchTerm,
    selectedCategory,
  ]);

  /* --------------------------------------------------------------------------
   * PAGINATION
   * ------------------------------------------------------------------------ */

  const totalPages = useMemo(
    () =>
      Math.max(
        1,
        Math.ceil(filteredData.length / pageSize)
      ),
    [filteredData.length, pageSize]
  );

  const safeCurrentPage = Math.min(
    Math.max(currentPage, 1),
    totalPages
  );

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  const paginatedData = useMemo(() => {
    const startIndex =
      (safeCurrentPage - 1) * pageSize;

    return filteredData.slice(
      startIndex,
      startIndex + pageSize
    );
  }, [
    filteredData,
    safeCurrentPage,
    pageSize,
  ]);

  /* --------------------------------------------------------------------------
   * STATISTICS
   *
   * Single-pass calculation for better performance on large datasets.
   * ------------------------------------------------------------------------ */

  const stats = useMemo(() => {
    const result = {
      total: 0,
      critical: 0,
      high: 0,
      medium: 0,
      totalTaxableValue: 0,
      totalOutputTax: 0,
      totalCashPaid: 0,
      totalExcessItc: 0,
    };

    for (const item of processedRecords) {
      result.total += 1;

      switch (item.riskCategory) {
        case RISK_CATEGORY.CRITICAL:
          result.critical += 1;
          break;

        case RISK_CATEGORY.HIGH:
          result.high += 1;
          break;

        case RISK_CATEGORY.MEDIUM:
        default:
          result.medium += 1;
          break;
      }

      result.totalTaxableValue += item.taxableValue;
      result.totalOutputTax += item.totalOutputTax;
      result.totalCashPaid += item.cashTaxPaid;
      result.totalExcessItc += item.excessItc;
    }

    return result;
  }, [processedRecords]);

  /* --------------------------------------------------------------------------
   * CATEGORY FILTER
   * ------------------------------------------------------------------------ */

  const handleCategoryClick = useCallback((category) => {
    setSelectedCategory((previous) =>
      previous === category
        ? RISK_CATEGORY.ALL
        : category
    );
  }, []);

  /* --------------------------------------------------------------------------
   * CLEAR FILTERS
   * ------------------------------------------------------------------------ */

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setSelectedCategory(RISK_CATEGORY.ALL);
    setCurrentPage(1);
  }, []);

  /* --------------------------------------------------------------------------
   * CSV EXPORT
   * ------------------------------------------------------------------------ */

  const exportToCSV = useCallback(() => {
    if (filteredData.length === 0) {
      return;
    }

    const headers = [
      "GSTIN",
      "Return Period",
      "Taxable Value",
      "Output Tax",
      "Cash Paid",
      "Utilized ITC",
      "Excess ITC",
      "ITC Ratio (%)",
      "Delay (Days)",
      "AI Risk Score (%)",
      "Risk Category",
    ];

    const rows = filteredData.map((row) => [
      row.gstin || "",
      selectedPeriod || "",
      row.taxableValue,
      row.totalOutputTax,
      row.cashTaxPaid,
      row.utilizedItc,
      row.excessItc,
      row.itcUtilizationRatio ?? "",
      row.filingDelayDays,
      getRiskScorePercent(row.xgbRiskScore),
      row.riskCategory,
    ]);

    const csvContent = [
      headers.map(escapeCsvValue).join(","),
      ...rows.map((row) =>
        row.map(escapeCsvValue).join(",")
      ),
    ].join("\r\n");

    // UTF-8 BOM improves Excel compatibility.
    const blob = new Blob(
      ["\uFEFF", csvContent],
      {
        type: "text/csv;charset=utf-8;",
      }
    );

    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download =
      `GST_Risk_Report_${selectedPeriod || "Report"}.csv`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.URL.revokeObjectURL(url);
  }, [filteredData, selectedPeriod]);

  /* --------------------------------------------------------------------------
   * DERIVED UI VALUES
   * ------------------------------------------------------------------------ */

  const activeFilter =
    selectedCategory !== RISK_CATEGORY.ALL ||
    Boolean(searchTerm.trim());

  const getPercentage = useCallback(
    (value) =>
      stats.total > 0
        ? ((value / stats.total) * 100).toFixed(1)
        : "0.0",
    [stats.total]
  );

  /* ==========================================================================
   * RENDER
   * ======================================================================== */

  return (
    <div
      className="gst-risk-dashboard min-vh-100 bg-body-tertiary text-dark"
      style={{
        fontFamily:
          "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div className="container-fluid px-3 px-md-4 py-3 py-md-4">

        {/* ====================================================================
            HEADER
        ==================================================================== */}

        <section className="card border-0 shadow-sm rounded-4 mb-4">
          <div className="card-body p-3 p-lg-4">

            <div className="d-flex flex-column flex-xl-row justify-content-between align-items-xl-center gap-4">

              <div className="d-flex align-items-center gap-3">

                <div
                  className="dashboard-icon rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
                  aria-hidden="true"
                >
                  <Building2 size={24} />
                </div>

                <div>
                  <div className="d-flex align-items-center gap-2 flex-wrap">

                    <h1 className="h5 fw-bold mb-0">
                      GSTR-3B Risk & Compliance Portal
                    </h1>

                    <span className="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle">
                      AI MONITORING
                    </span>

                  </div>

                  <p className="text-muted small mb-0 mt-1">
                    Machine-learning based GST return risk,
                    tax liability and compliance monitoring
                  </p>

                  <div className="d-flex align-items-center flex-wrap gap-2 mt-2 text-muted">

                    <Database size={13} />

                    <span className="small">
                      {formatNumber(stats.total)} filings loaded
                    </span>

                    {selectedPeriod && (
                      <>
                        <span aria-hidden="true">•</span>

                        <span className="small fw-semibold">
                          Return Period: {selectedPeriod}
                        </span>
                      </>
                    )}

                  </div>
                </div>
              </div>

              {/* CONTROLS */}

              <div className="d-flex flex-wrap align-items-center gap-2">

                <div className="period-control d-flex align-items-center rounded-3 border bg-light px-3 py-2">

                  <Calendar
                    size={15}
                    className="text-primary me-2 flex-shrink-0"
                  />

                  <div className="me-2">
                    <div className="period-label">
                      RETURN PERIOD
                    </div>
                  </div>

                  {loadingPeriods ? (
                    <Loader2
                      size={16}
                      className="text-primary spin"
                    />
                  ) : (
                    <select
                      id="period-select"
                      value={selectedPeriod}
                      onChange={(event) =>
                        setSelectedPeriod(
                          event.target.value
                        )
                      }
                      disabled={
                        periodOptions.length === 0 ||
                        loadingData
                      }
                      className="form-select form-select-sm border-0 bg-transparent shadow-none fw-bold p-0"
                      aria-label="Return period"
                    >
                      {periodOptions.map((period) => (
                        <option
                          key={period.value}
                          value={period.value}
                        >
                          {period.label} ({period.value})
                        </option>
                      ))}
                    </select>
                  )}

                </div>

                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={
                    loadingData || !selectedPeriod
                  }
                  className="btn btn-sm btn-outline-secondary rounded-3 px-3 d-flex align-items-center justify-content-center gap-2"
                >
                  <RefreshCw
                    size={15}
                    className={loadingData ? "spin" : ""}
                  />
                  Refresh
                </button>

                <button
                  type="button"
                  onClick={exportToCSV}
                  disabled={
                    loadingData ||
                    filteredData.length === 0
                  }
                  className="btn btn-sm btn-success rounded-3 px-3 d-flex align-items-center justify-content-center gap-2"
                >
                  <FileSpreadsheet size={15} />
                  Export CSV
                </button>

              </div>
            </div>
          </div>
        </section>

        {/* ====================================================================
            ERROR
        ==================================================================== */}

        {error && (
          <div
            className="alert alert-danger border-0 shadow-sm rounded-3 d-flex align-items-center justify-content-between"
            role="alert"
          >
            <div className="d-flex align-items-center gap-2">
              <AlertTriangle size={18} />

              <span className="small fw-semibold">
                {error}
              </span>
            </div>

            <button
              type="button"
              className="btn btn-sm btn-link text-danger p-0"
              onClick={() => setError(null)}
              aria-label="Close error"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {/* ====================================================================
            KPI CARDS
        ==================================================================== */}

        <div className="row g-3 mb-4">

          {/* TOTAL */}

          <div className="col-12 col-sm-6 col-xl-3">
            <button
              type="button"
              onClick={() =>
                setSelectedCategory(RISK_CATEGORY.ALL)
              }
              className={`kpi-card card w-100 h-100 border shadow-sm rounded-4 ${selectedCategory === RISK_CATEGORY.ALL
                  ? "border-primary"
                  : "border-light-subtle"
                }`}
            >
              <div className="card-body p-6">

                <div className="d-flex justify-content-between align-items-start">

                  <div>
                    <div className="text-muted small fw-bold text-uppercase">
                      Total Filings
                    </div>

                    <div className="display-6 fw-bold mt-1">
                      {formatNumber(stats.total)}
                    </div>

                    <div className="text-muted small">
                      Current return period
                    </div>
                  </div>

                  <div className="rounded-3 bg-light p-2">
                    <Layers size={19} />
                  </div>

                </div>
              </div>
            </button>
          </div>

          {/* CRITICAL */}

          <div className="col-12 col-sm-6 col-xl-3">
            <button
              type="button"
              onClick={() =>
                handleCategoryClick(
                  RISK_CATEGORY.CRITICAL
                )
              }
              className={`kpi-card card w-100 h-100 border shadow-sm rounded-4 ${selectedCategory === RISK_CATEGORY.CRITICAL
                  ? "border-danger"
                  : "border-light-subtle"
                }`}
            >
              <div className="card-body p-3">

                <div className="d-flex justify-content-between align-items-start">

                  <div>
                    <div className="text-danger small fw-bold text-uppercase">
                      Critical Risk
                    </div>

                    <div className="display-6 fw-bold text-danger mt-1">
                      {formatNumber(stats.critical)}
                    </div>

                    <div className="text-muted small">
                      Immediate attention
                    </div>
                  </div>

                  <div className="rounded-3 bg-danger-subtle text-danger p-2">
                    <ShieldAlert size={19} />
                  </div>

                </div>

                <div
                  className="progress mt-3"
                  style={{ height: 5 }}
                  aria-label="Critical risk percentage"
                >
                  <div
                    className="progress-bar bg-danger"
                    style={{
                      width: `${getPercentage(
                        stats.critical
                      )}%`,
                    }}
                  />
                </div>

                <div className="mt-2 text-danger small fw-semibold">
                  {getPercentage(stats.critical)}% of filings
                </div>

              </div>
            </button>
          </div>

          {/* HIGH */}

          <div className="col-12 col-sm-6 col-xl-3">
            <button
              type="button"
              onClick={() =>
                handleCategoryClick(
                  RISK_CATEGORY.HIGH
                )
              }
              className={`kpi-card card w-100 h-100 border shadow-sm rounded-4 ${selectedCategory === RISK_CATEGORY.HIGH
                  ? "border-warning"
                  : "border-light-subtle"
                }`}
            >
              <div className="card-body p-3">

                <div className="d-flex justify-content-between align-items-start">

                  <div>
                    <div className="text-warning-emphasis small fw-bold text-uppercase">
                      High Risk
                    </div>

                    <div className="display-6 fw-bold text-warning-emphasis mt-1">
                      {formatNumber(stats.high)}
                    </div>

                    <div className="text-muted small">
                      Requires review
                    </div>
                  </div>

                  <div className="rounded-3 bg-warning-subtle text-warning-emphasis p-2">
                    <AlertTriangle size={19} />
                  </div>

                </div>

                <div
                  className="progress mt-3"
                  style={{ height: 5 }}
                  aria-label="High risk percentage"
                >
                  <div
                    className="progress-bar bg-warning"
                    style={{
                      width: `${getPercentage(
                        stats.high
                      )}%`,
                    }}
                  />
                </div>

                <div className="mt-2 text-warning-emphasis small fw-semibold">
                  {getPercentage(stats.high)}% of filings
                </div>

              </div>
            </button>
          </div>

          {/* MEDIUM */}

          <div className="col-12 col-sm-6 col-xl-3">
            <button
              type="button"
              onClick={() =>
                handleCategoryClick(
                  RISK_CATEGORY.MEDIUM
                )
              }
              className={`kpi-card card w-100 h-100 border shadow-sm rounded-4 ${selectedCategory === RISK_CATEGORY.MEDIUM
                  ? "border-success"
                  : "border-light-subtle"
                }`}
            >
              <div className="card-body p-3">

                <div className="d-flex justify-content-between align-items-start">

                  <div>
                    <div className="text-success small fw-bold text-uppercase">
                      Standard Compliance
                    </div>

                    <div className="display-6 fw-bold text-success mt-1">
                      {formatNumber(stats.medium)}
                    </div>

                    <div className="text-muted small">
                      Normal monitoring
                    </div>
                  </div>

                  <div className="rounded-3 bg-success-subtle text-success p-2">
                    <CheckCircle2 size={19} />
                  </div>

                </div>

                <div
                  className="progress mt-3"
                  style={{ height: 5 }}
                  aria-label="Standard compliance percentage"
                >
                  <div
                    className="progress-bar bg-success"
                    style={{
                      width: `${getPercentage(
                        stats.medium
                      )}%`,
                    }}
                  />
                </div>

                <div className="mt-2 text-success small fw-semibold">
                  {getPercentage(stats.medium)}% of filings
                </div>

              </div>
            </button>
          </div>

        </div>

        {/* ====================================================================
            FINANCIAL SUMMARY
        ==================================================================== */}

        <section className="card border-0 shadow-sm rounded-4 mb-4">
          <div className="card-body p-3">

            <div className="row g-0 text-center">

              <div className="col-12 col-md-3 financial-item px-3 py-2">
                <div className="d-flex align-items-center justify-content-center gap-2 text-muted small fw-semibold">
                  <TrendingUp size={15} />
                  TAXABLE VALUE
                </div>

                <div className="fs-5 fw-bold mt-1">
                  {formatCompactCurrency(
                    stats.totalTaxableValue
                  )}
                </div>
              </div>

              <div className="col-12 col-md-3 financial-item px-3 py-2">
                <div className="d-flex align-items-center justify-content-center gap-2 text-muted small fw-semibold">
                  <IndianRupee size={15} />
                  OUTPUT TAX
                </div>

                <div className="fs-5 fw-bold mt-1">
                  {formatCompactCurrency(
                    stats.totalOutputTax
                  )}
                </div>
              </div>

              <div className="col-12 col-md-3 financial-item px-3 py-2">
                <div className="d-flex align-items-center justify-content-center gap-2 text-muted small fw-semibold">
                  <IndianRupee size={15} />
                  CASH TAX PAID
                </div>

                <div className="fs-5 fw-bold mt-1">
                  {formatCompactCurrency(
                    stats.totalCashPaid
                  )}
                </div>
              </div>

              <div className="col-12 col-md-3 px-3 py-2">
                <div className="d-flex align-items-center justify-content-center gap-2 text-danger small fw-semibold">
                  <AlertTriangle size={15} />
                  EXCESS ITC
                </div>

                <div className="fs-5 fw-bold text-danger mt-1">
                  {formatCompactCurrency(
                    stats.totalExcessItc
                  )}
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ====================================================================
            DATA TABLE
        ==================================================================== */}

        <section className="card border-0 shadow-sm rounded-4 overflow-hidden">

          {/* TOOLBAR */}

          <div className="card-header bg-white border-bottom p-3">

            <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3">

              {/* SEARCH */}

              <div
                className="input-group"
                style={{
                  maxWidth: 430,
                }}
              >
                <span className="input-group-text bg-light border-end-0">
                  <Search size={16} />
                </span>

                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) =>
                    setSearchTerm(event.target.value)
                  }
                  placeholder="Search by GSTIN..."
                  className="form-control bg-light border-start-0 shadow-none"
                  aria-label="Search GSTIN"
                />

                {searchTerm && (
                  <button
                    type="button"
                    className="btn bg-light border border-start-0"
                    onClick={() => setSearchTerm("")}
                    aria-label="Clear search"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              {/* FILTER STATUS */}

              <div className="d-flex flex-wrap align-items-center justify-content-lg-end gap-2">

                {selectedCategory !==
                  RISK_CATEGORY.ALL && (
                    <button
                      type="button"
                      className="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle px-3 py-2"
                      onClick={() =>
                        setSelectedCategory(
                          RISK_CATEGORY.ALL
                        )
                      }
                    >
                      Risk: {selectedCategory}
                      <FilterX
                        size={12}
                        className="ms-1"
                      />
                    </button>
                  )}

                {searchTerm && (
                  <span className="badge rounded-pill bg-light text-dark border px-3 py-2">
                    Search active
                  </span>
                )}

                {activeFilter && (
                  <button
                    type="button"
                    className="btn btn-sm btn-link text-danger text-decoration-none"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>
                )}

                <span className="text-muted small">
                  <strong className="text-dark">
                    {formatNumber(filteredData.length)}
                  </strong>{" "}
                  record
                  {filteredData.length !== 1 ? "s" : ""}
                </span>

              </div>
            </div>
          </div>

          {/* TABLE */}

          <div
            className="table-responsive gst-table-container"
            style={{
              maxHeight: 620,
              overflowY: "auto",
            }}
          >
            <table
              className="table table-hover align-middle mb-0 gst-risk-table"
              style={{
                minWidth: TABLE_MIN_WIDTH,
              }}
            >

              <thead className="position-sticky top-0">
                <tr>

                  <th colSpan={2}>
                    TAXPAYER
                  </th>

                  <th colSpan={3}>
                    TAX POSITION
                  </th>

                  <th colSpan={2}>
                    ITC
                  </th>

                  <th>
                    COMPLIANCE
                  </th>

                  <th>
                    AI RISK
                  </th>

                </tr>

                <tr className="column-header">

                  <th>GSTIN</th>

                  <th>Taxable Value</th>

                  <th>Output Tax</th>

                  <th>Cash Paid</th>

                  <th>Utilized ITC</th>

                  <th>Excess ITC</th>

                  <th>ITC Ratio</th>

                  <th>Filing Delay</th>

                  <th>Risk / Status</th>

                </tr>
              </thead>

              <tbody>

                {/* LOADING */}

                {loadingData && (
                  <tr>
                    <td
                      colSpan={9}
                      className="text-center py-5"
                    >
                      <div className="d-flex flex-column align-items-center justify-content-center gap-2">

                        <Loader2
                          size={30}
                          className="text-primary spin"
                        />

                        <span className="fw-semibold">
                          Loading GST risk records...
                        </span>

                        <span className="text-muted small">
                          Return period:{" "}
                          {selectedPeriod}
                        </span>

                      </div>
                    </td>
                  </tr>
                )}

                {/* ERROR */}

                {!loadingData && error && (
                  <tr>
                    <td
                      colSpan={9}
                      className="text-center py-5"
                    >
                      <AlertTriangle
                        size={30}
                        className="text-danger mb-2"
                      />

                      <div className="fw-semibold text-danger">
                        Unable to load records
                      </div>

                      <div className="text-muted small mt-1">
                        {error}
                      </div>

                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary mt-3"
                        onClick={handleRefresh}
                      >
                        <RefreshCw
                          size={14}
                          className="me-1"
                        />
                        Try Again
                      </button>
                    </td>
                  </tr>
                )}

                {/* DATA */}

                {!loadingData &&
                  !error &&
                  paginatedData.length > 0 &&
                  paginatedData.map((row) => {

                    const riskPercent =
                      getRiskScorePercent(
                        row.xgbRiskScore
                      );

                    const isCritical =
                      row.riskCategory ===
                      RISK_CATEGORY.CRITICAL;

                    const isHigh =
                      row.riskCategory ===
                      RISK_CATEGORY.HIGH;

                    const delay =
                      row.filingDelayDays;

                    const excessItc =
                      row.excessItc;

                    const rowKey =
                      row.id ??
                      row.gstin ??
                      `${row.gstin}-${row.retPeriod ?? selectedPeriod}`;

                    return (
                      <tr key={rowKey}>

                        {/* GSTIN */}

                        <td>
                          <div className="fw-bold font-monospace text-dark">
                            {row.gstin || "—"}
                          </div>

                          <div className="text-muted small mt-1">
                            {selectedPeriod}
                          </div>
                        </td>

                        {/* TAXABLE VALUE */}

                        <td>
                          <span
                            className="fw-semibold"
                            title={formatCurrency(
                              row.taxableValue
                            )}
                          >
                            {formatCompactCurrency(
                              row.taxableValue
                            )}
                          </span>
                        </td>

                        {/* OUTPUT TAX */}

                        <td>
                          <span
                            className="fw-semibold"
                            title={formatCurrency(
                              row.totalOutputTax
                            )}
                          >
                            {formatCompactCurrency(
                              row.totalOutputTax
                            )}
                          </span>
                        </td>

                        {/* CASH PAID */}

                        <td>
                          <span className="fw-semibold">
                            {formatCompactCurrency(
                              row.cashTaxPaid
                            )}
                          </span>
                        </td>

                        {/* UTILIZED ITC */}

                        <td>
                          <span className="fw-semibold">
                            {formatCompactCurrency(
                              row.utilizedItc
                            )}
                          </span>
                        </td>

                        {/* EXCESS ITC */}

                        <td>
                          <div
                            className={
                              excessItc > 0
                                ? "text-danger fw-bold"
                                : "text-muted"
                            }
                          >
                            {excessItc > 0
                              ? formatCompactCurrency(
                                excessItc
                              )
                              : "₹0"}
                          </div>

                          {excessItc >
                            RISK_THRESHOLD.CRITICAL_EXCESS_ITC && (
                              <span className="badge bg-danger-subtle text-danger mt-1">
                                HIGH
                              </span>
                            )}
                        </td>

                        {/* ITC RATIO */}

                        <td>
                          <span className="fw-semibold">
                            {row.itcUtilizationRatio !==
                              null
                              ? `${row.itcUtilizationRatio.toFixed(
                                1
                              )}%`
                              : "N/A"}
                          </span>
                        </td>

                        {/* DELAY */}

                        <td>
                          <div
                            className={`d-inline-flex align-items-center justify-content-center gap-1 ${delay > 10
                                ? "text-danger fw-bold"
                                : delay > 0
                                  ? "text-warning-emphasis fw-semibold"
                                  : "text-success fw-semibold"
                              }`}
                          >
                            <Clock3 size={14} />
                            {delay} d
                          </div>

                          {delay > 10 && (
                            <div className="small text-danger mt-1">
                              Delayed
                            </div>
                          )}
                        </td>

                        {/* RISK */}

                        <td>

                          <div className="d-flex flex-column align-items-center justify-content-center gap-1">

                            <div className="d-flex align-items-center justify-content-center gap-2">

                              <span
                                className={`badge rounded-pill px-2 py-1 ${isCritical
                                    ? "bg-danger"
                                    : isHigh
                                      ? "bg-warning text-dark"
                                      : "bg-success"
                                  }`}
                              >
                                {row.riskCategory}
                              </span>

                              <strong
                                className={
                                  isCritical
                                    ? "text-danger"
                                    : isHigh
                                      ? "text-warning-emphasis"
                                      : "text-success"
                                }
                              >
                                {formatRiskScore(
                                  row.xgbRiskScore
                                )}
                              </strong>

                            </div>

                            <div
                              className="progress w-100"
                              style={{
                                height: 4,
                                maxWidth: 125,
                              }}
                              title={`AI Risk Score: ${formatRiskScore(
                                row.xgbRiskScore
                              )}`}
                            >
                              <div
                                className={`progress-bar ${isCritical
                                    ? "bg-danger"
                                    : isHigh
                                      ? "bg-warning"
                                      : "bg-success"
                                  }`}
                                style={{
                                  width: `${riskPercent}%`,
                                }}
                              />
                            </div>

                          </div>

                        </td>

                      </tr>
                    );
                  })}

                {/* EMPTY */}

                {!loadingData &&
                  !error &&
                  paginatedData.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        className="text-center py-5"
                      >

                        <Search
                          size={34}
                          className="text-muted mb-2"
                        />

                        <div className="fw-semibold">
                          No matching records
                        </div>

                        <div className="text-muted small mt-1">
                          {selectedPeriod
                            ? `No records found for ${selectedPeriod} with the current filters.`
                            : "Select a return period to view records."}
                        </div>

                        {activeFilter && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary mt-3"
                            onClick={clearFilters}
                          >
                            <FilterX
                              size={14}
                              className="me-1"
                            />
                            Clear Filters
                          </button>
                        )}

                      </td>
                    </tr>
                  )}

              </tbody>
            </table>
          </div>

          {/* ==================================================================
              PAGINATION
          ================================================================== */}

          {!loadingData &&
            filteredData.length > 0 && (
              <div className="card-footer bg-white border-top p-3">

                <div className="d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">

                  <div className="d-flex align-items-center gap-2">

                    <span className="text-muted small">
                      Rows per page
                    </span>

                    <select
                      value={pageSize}
                      onChange={(event) => {
                        setPageSize(
                          Number(event.target.value)
                        );
                        setCurrentPage(1);
                      }}
                      className="form-select form-select-sm"
                      style={{ width: 78 }}
                      aria-label="Rows per page"
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option
                          key={size}
                          value={size}
                        >
                          {size}
                        </option>
                      ))}
                    </select>

                    <span className="text-muted small">
                      {formatNumber(
                        (safeCurrentPage - 1) *
                        pageSize +
                        1
                      )}
                      {" – "}
                      {formatNumber(
                        Math.min(
                          safeCurrentPage * pageSize,
                          filteredData.length
                        )
                      )}
                      {" of "}
                      {formatNumber(
                        filteredData.length
                      )}
                    </span>

                  </div>

                  <div className="d-flex align-items-center gap-2">

                    <button
                      type="button"
                      onClick={() =>
                        setCurrentPage((previous) =>
                          Math.max(previous - 1, 1)
                        )
                      }
                      disabled={
                        safeCurrentPage === 1
                      }
                      className="btn btn-sm btn-outline-secondary rounded-2 d-flex align-items-center justify-content-center"
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </button>

                    <span className="small text-muted px-2">
                      Page{" "}
                      <strong className="text-dark">
                        {safeCurrentPage}
                      </strong>{" "}
                      of{" "}
                      <strong className="text-dark">
                        {totalPages}
                      </strong>
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setCurrentPage((previous) =>
                          Math.min(
                            previous + 1,
                            totalPages
                          )
                        )
                      }
                      disabled={
                        safeCurrentPage === totalPages
                      }
                      className="btn btn-sm btn-outline-secondary rounded-2 d-flex align-items-center justify-content-center"
                      aria-label="Next page"
                    >
                      <ChevronRight size={16} />
                    </button>

                  </div>
                </div>
              </div>
            )}
        </section>

        {/* ====================================================================
            FOOTER
        ==================================================================== */}

        <footer className="d-flex flex-column flex-md-row justify-content-between align-items-center gap-2 mt-3 px-1">

          <span className="text-muted small">
            GSTR-3B Risk & Compliance Monitoring
          </span>

          <span className="text-muted small text-center">
            AI score is an analytical indicator and should
            be used with departmental verification.
          </span>

        </footer>

      </div>

      {/* ======================================================================
          LOCAL CSS
      ======================================================================== */}

      <style>
        {`
          .gst-risk-dashboard {
            --gst-table-header: #212529;
            --gst-table-subheader: #f5f7fa;
            --gst-table-border: #e5e7eb;
          }

          /* ================================================================
             SPINNER
          ================================================================= */

          .spin {
            animation: gst-spin 0.9s linear infinite;
          }

          @keyframes gst-spin {
            from {
              transform: rotate(0deg);
            }

            to {
              transform: rotate(360deg);
            }
          }

          /* ================================================================
             DASHBOARD ICON
          ================================================================= */

          .dashboard-icon {
            width: 48px;
            height: 48px;
            background: #e8f0fe;
            color: #0d6efd;
          }

          .period-control {
            min-width: 230px;
          }

          .period-label {
            color: #6c757d;
            font-size: 0.65rem;
            font-weight: 700;
            letter-spacing: 0.05em;
            white-space: nowrap;
          }

          /* ================================================================
             KPI CARDS
          ================================================================= */

          .kpi-card {
            cursor: pointer;
            background: #ffffff;
            text-align: left;
            transition:
              transform 0.15s ease,
              box-shadow 0.15s ease,
              border-color 0.15s ease;
          }

          .kpi-card:hover {
            transform: translateY(-2px);
            box-shadow:
              0 0.45rem 1.2rem rgba(0, 0, 0, 0.08) !important;
          }

          .kpi-card:focus-visible {
            outline: 2px solid var(--bs-primary);
            outline-offset: 2px;
          }

          /* ================================================================
             FINANCIAL SUMMARY
          ================================================================= */

          .financial-item {
            border-right: 1px solid var(--bs-border-color);
          }

          /* ================================================================
             TABLE
          ================================================================= */

          .gst-table-container {
            scrollbar-width: thin;
          }

          .gst-risk-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            font-size: 0.82rem;
          }

          /*
           * IMPORTANT:
           * All table headers and all table data are CENTER aligned.
           */
          .gst-risk-table th,
          .gst-risk-table td {
            text-align: center !important;
            vertical-align: middle !important;
          }

          /* First header row */

          .gst-risk-table thead tr:first-child th {
            position: sticky;
            top: 0;
            z-index: 6;

            background: var(--gst-table-header);
            color: #ffffff;

            padding: 0.7rem 0.75rem;

            font-size: 0.72rem;
            font-weight: 700;

            letter-spacing: 0.04em;
            text-transform: uppercase;

            border: 0;
            white-space: nowrap;
          }

          /* Second header row */

          .gst-risk-table thead tr.column-header th {
            position: sticky;
            top: 36px;
            z-index: 5;

            background: var(--gst-table-subheader);
            color: #343a40;

            padding: 0.7rem 0.65rem;

            font-size: 0.68rem;
            font-weight: 700;

            letter-spacing: 0.035em;
            text-transform: uppercase;

            border-bottom: 1px solid var(--gst-table-border);

            white-space: nowrap;
          }

          .gst-risk-table tbody td {
            padding: 0.75rem 0.65rem;
            border-bottom: 1px solid #edf0f2;
            white-space: nowrap;
          }

          .gst-risk-table tbody tr {
            transition:
              background-color 0.12s ease;
          }

          .gst-risk-table tbody tr:hover {
            background-color: #f8fafc;
          }

          /*
           * GSTIN should still remain visually readable while the
           * cell itself stays centered.
           */
          .gst-risk-table .font-monospace {
            letter-spacing: 0.02em;
          }

          /*
           * Keep risk progress bar centered.
           */
          .gst-risk-table .progress {
            margin-left: auto;
            margin-right: auto;
          }

          /* ================================================================
             TABLE BORDER / STICKY HEADER
          ================================================================= */

          .gst-risk-table thead {
            box-shadow:
              0 1px 0 rgba(0, 0, 0, 0.08);
          }

          .gst-risk-table tbody tr:last-child td {
            border-bottom: 0;
          }

          /* ================================================================
             BADGES
          ================================================================= */

          .gst-risk-table .badge {
            font-size: 0.65rem;
            letter-spacing: 0.02em;
          }

          /* ================================================================
             RESPONSIVE
          ================================================================= */

          @media (max-width: 991.98px) {
            .period-control {
              min-width: 210px;
            }

            .gst-risk-table {
              font-size: 0.78rem;
            }
          }

          @media (max-width: 767.98px) {

            .financial-item {
              border-right: 0;
              border-bottom: 1px solid var(--bs-border-color);
            }

            .financial-item:last-child {
              border-bottom: 0;
            }

            .period-control {
              min-width: 100%;
            }

            .gst-risk-table thead tr.column-header th {
              top: 35px;
            }
          }

          @media (max-width: 575.98px) {

            .display-6 {
              font-size: 1.8rem;
            }

            .gst-risk-table {
              font-size: 0.75rem;
            }

            .gst-risk-table tbody td {
              padding: 0.65rem 0.5rem;
            }
          }

          /* ================================================================
             ACCESSIBILITY
          ================================================================= */

          @media (prefers-reduced-motion: reduce) {

            .spin,
            .kpi-card,
            .gst-risk-table tbody tr {
              animation: none !important;
              transition: none !important;
            }
          }
        `}
      </style>
    </div>
  );
}

