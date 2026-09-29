import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  FaBalanceScale,
  FaBuilding,
  FaChartLine,
  FaCheckCircle,
  FaClock,
  FaExclamationCircle,
  FaExclamationTriangle,
  FaFileInvoiceDollar,
  FaHistory,
  FaIdBadge,
  FaLandmark,
  FaMoneyBillWave,
  FaPercentage,
  FaSearch,
  FaShieldAlt,
  FaSpinner,
  FaSyncAlt,
  FaTable,
  FaUserTie,
  FaChevronRight,
  FaExchangeAlt,
} from "react-icons/fa";

import { fetchGstinAnalysis } from "../../services/taxpayerService";
import { fetchPrediction } from "../../services/predictionService";

import "./taxpayerview.css";

/* ============================================================
 * CONSTANTS
 * ============================================================ */

const GSTIN_LENGTH = 15;
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PREDICTION_MONTHS = 3;
const RECENT_HISTORY_ROWS = 3;
const ALERTS_PREVIEW_LIMIT = 5;

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const RISK_COLOR = {
  low: "#0E7C46",
  medium: "#B45309",
  high: "#C0362C",
  critical: "#7A2418",
};

// Created once: building an Intl.NumberFormat per call is expensive
// and the history tables format hundreds of values per render.
const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const TABS = [
  { id: "overview", label: "Overview", Icon: FaChartLine },
  { id: "history", label: "GSTR-3B History", Icon: FaTable },
  { id: "tax", label: "Tax Breakdown", Icon: FaFileInvoiceDollar },
  { id: "risk", label: "Risk & Alerts", Icon: FaShieldAlt },
  { id: "prediction", label: "AI Prediction", Icon: FaChartLine },
];

const TAX_SUMMARY_ITEMS = [
  {
    key: "taxableValue",
    label: "Taxable Value",
    color: "#6f42c1",
    bgTint: "#f3e8ff",
    borderColor: "#d8b4fe",
  },
  {
    key: "outputTax",
    label: "Output Tax",
    color: "#1e293b",
    bgTint: "#f1f5f9",
    borderColor: "#cbd5e1",
  },
  {
    key: "itc",
    label: "ITC Claimed",
    color: "#0284c7",
    bgTint: "#e0f2fe",
    borderColor: "#bae6fd",
  },
  {
    key: "cash",
    label: "Cash Paid",
    color: "#0d9488",
    bgTint: "#ccfbf1",
    borderColor: "#99f6e4",
  },
  {
    key: "rcm",
    label: "RCM Tax",
    color: "#475569",
    bgTint: "#f1f5f9",
    borderColor: "#cbd5e1",
  },
  {
    key: "itcEligible",
    label: "ITC Eligible",
    color: "#fd7e14",
    bgTint: "#ffedd5",
    borderColor: "#fed7aa",
  },
];

const COMPLIANCE_ITEMS = [
  {
    key: "itc",
    label: "Average ITC Ratio",
    badge: "ITC",
    color: "#6f42c1",
    bgTint: "#f3e8ff",
    borderColor: "#d8b4fe",
  },
  {
    key: "cash",
    label: "Average Cash Payment Ratio",
    badge: "CASH",
    color: "#0d9488",
    bgTint: "#ccfbf1",
    borderColor: "#99f6e4",
  },
];

const GST_COMPONENT_ITEMS = [
  {
    key: "igst",
    label: "IGST",
    color: "#6f42c1",
    bgTint: "#f3e8ff",
    borderColor: "#d8b4fe",
  },
  {
    key: "cgst",
    label: "CGST",
    color: "#0d9488",
    bgTint: "#ccfbf1",
    borderColor: "#99f6e4",
  },
  {
    key: "sgst",
    label: "SGST",
    color: "#0284c7",
    bgTint: "#e0f2fe",
    borderColor: "#bae6fd",
  },
  {
    key: "cess",
    label: "CESS",
    color: "#fd7e14",
    bgTint: "#ffedd5",
    borderColor: "#fed7aa",
  },
];

const PAYMENT_ITEMS = [
  {
    key: "itc",
    label: "ITC Claimed",
    icon: <FaFileInvoiceDollar size={15} />,
    badgeBg: "bg-primary text-white",
    borderColor: "#bfdbfe",
    bgColor: "#f0f9ff",
    valueColor: "text-primary",
  },
  {
    key: "cash",
    label: "Cash Paid",
    icon: <FaMoneyBillWave size={15} />,
    badgeBg: "bg-success text-white",
    borderColor: "#bbf7d0",
    bgColor: "#f0fdf4",
    valueColor: "text-success",
  },
  {
    key: "rcm",
    label: "RCM Tax",
    icon: <FaExchangeAlt size={15} />,
    badgeBg: "bg-warning text-dark",
    borderColor: "#fde68a",
    bgColor: "#fffbeb",
    valueColor: "text-dark",
  },
];

const RATIO_ITEMS = [
  {
    key: "cash",
    label: "Cash / Output Tax",
    progressBg: "bg-success",
    cardBg: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  {
    key: "itc",
    label: "ITC / Output Tax",
    progressBg: "bg-primary",
    cardBg: "#f0f9ff",
    borderColor: "#bfdbfe",
  },
];

const ALERT_STYLES = {
  critical: {
    wrapper: "border-danger bg-danger-subtle",
    icon: "bg-danger text-white",
    badge: "bg-danger text-white",
  },
  high: {
    wrapper: "border-danger bg-danger-subtle",
    icon: "bg-danger text-white",
    badge: "bg-danger text-white",
  },
  medium: {
    wrapper: "border-warning bg-warning-subtle",
    icon: "bg-warning text-dark",
    badge: "bg-warning text-dark",
  },
  low: {
    wrapper: "border-secondary bg-light",
    icon: "bg-secondary text-white",
    badge: "bg-secondary text-white",
  },
};

const EMPTY_LIST = [];

/* ============================================================
 * HELPERS
 * ============================================================ */

const safeNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const hasValue = (value) =>
  value !== null && value !== undefined && value !== "";

const displayText = (value, fallback = "N/A") =>
  hasValue(value) ? String(value) : fallback;

const normalizeGstin = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

const isValidGstin = (value) => GSTIN_REGEX.test(normalizeGstin(value));

const formatINR = (value) => INR_FORMATTER.format(safeNumber(value));

const formatINRCompact = (value) => {
  const amount = safeNumber(value);

  if (Math.abs(amount) >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)} Cr`;
  }

  if (Math.abs(amount) >= 100000) {
    return `₹${(amount / 100000).toFixed(2)} L`;
  }

  if (Math.abs(amount) >= 1000) {
    return `₹${(amount / 1000).toFixed(2)} K`;
  }

  return formatINR(amount);
};

const formatPercentage = (value) => `${(safeNumber(value) * 100).toFixed(2)}%`;

const clampPercent = (value) => Math.min(Math.max(value, 0), 100);

const formatReturnPeriod = (period) => {
  if (!period) {
    return "N/A";
  }

  const value = String(period);

  if (/^\d{6}$/.test(value)) {
    const month = Number(value.substring(0, 2));

    if (month >= 1 && month <= 12) {
      return `${MONTH_LABELS[month - 1]} ${value.substring(2)}`;
    }
  }

  return value;
};

const getRiskClass = (risk) => {
  const value = String(risk || "LOW")
    .trim()
    .toUpperCase();

  if (value.includes("CRITICAL") || value.includes("VERY_HIGH")) {
    return "critical";
  }

  if (value.includes("HIGH")) {
    return "high";
  }

  if (value.includes("MEDIUM")) {
    return "medium";
  }

  return "low";
};

const getSeverityClass = (severity) => {
  const value = String(severity || "LOW")
    .trim()
    .toUpperCase();

  if (value.includes("CRITICAL")) {
    return "critical";
  }

  if (value.includes("HIGH")) {
    return "high";
  }

  if (value.includes("MEDIUM")) {
    return "medium";
  }

  return "low";
};

/**
 * The backend returns GST registration status as a code ("A" = Active).
 * Map it so the badge does not show a warning colour for active taxpayers.
 */
const getStatusLabel = (status) => {
  const value = String(status || "ACTIVE")
    .trim()
    .toUpperCase();

  return value === "A" ? "ACTIVE" : value;
};

const getDelayBadgeClass = (days) => {
  const value = safeNumber(days);

  if (value >= 15) {
    return "bg-danger-subtle text-danger";
  }

  if (value > 0) {
    return "bg-warning-subtle text-warning-emphasis";
  }

  return "bg-success-subtle text-success";
};

const getFilingBadgeClass = (status) => {
  const value = String(status || "FILED")
    .trim()
    .toUpperCase();

  if (value === "DELAYED") {
    return "bg-danger-subtle text-danger";
  }

  if (value === "PENDING") {
    return "bg-warning-subtle text-warning-emphasis";
  }

  return "bg-success-subtle text-success";
};

const isCancelledError = (err, signal) =>
  err?.name === "CanceledError" ||
  err?.name === "AbortError" ||
  err?.code === "ERR_CANCELED" ||
  Boolean(signal?.aborted);

const getErrorMessage = (err, fallback) =>
  err?.response?.data?.message || err?.message || fallback;

// Sort key MMYYYY -> YYYYMM so periods compare chronologically.
const periodSortKey = (period) => {
  const value = String(period || "");

  return value.length === 6
    ? value.substring(2) + value.substring(0, 2)
    : value;
};

/* ============================================================
 * MAIN COMPONENT
 * ============================================================ */

const TaxpayerView = ({ gstin: initialGstin = "", onBack }) => {
  const [selectedGstin, setSelectedGstin] = useState(() =>
    normalizeGstin(initialGstin),
  );

  const [analysis, setAnalysis] = useState(null);
  const [prediction, setPrediction] = useState(null);

  const [loading, setLoading] = useState(false);
  const [predictionLoading, setPredictionLoading] = useState(false);

  const [error, setError] = useState("");
  const [predictionError, setPredictionError] = useState("");

  const [activeTab, setActiveTab] = useState("overview");

  const analysisControllerRef = useRef(null);
  // Incremented for every prediction request (and on unmount) so a slow,
  // stale response can never overwrite the data of a newer GSTIN.
  const predictionRequestRef = useRef(0);

  const isBusy = loading || predictionLoading;

  /* ============================================================
   * LOAD ANALYSIS
   * ============================================================ */

  const loadAnalysis = useCallback(async (gstinValue, signal) => {
    const cleanGstin = normalizeGstin(gstinValue);

    if (!cleanGstin) {
      setAnalysis(null);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await fetchGstinAnalysis(cleanGstin, signal);

      if (signal?.aborted) {
        return;
      }

      setAnalysis(result || null);
    } catch (err) {
      if (isCancelledError(err, signal)) {
        return;
      }

      setError(getErrorMessage(err, "Unable to load GSTIN analysis."));
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  /* ============================================================
   * LOAD PREDICTION
   * ============================================================ */

  const loadPrediction = useCallback(async (gstinValue) => {
    const cleanGstin = normalizeGstin(gstinValue);

    if (!cleanGstin) {
      return;
    }

    const requestId = ++predictionRequestRef.current;
    const isCurrent = () => requestId === predictionRequestRef.current;

    setPredictionLoading(true);
    setPredictionError("");

    try {
      const result = await fetchPrediction(cleanGstin, PREDICTION_MONTHS);

      if (isCurrent()) {
        setPrediction(result || null);
      }
    } catch (err) {
      if (isCurrent()) {
        setPredictionError(getErrorMessage(err, "Unable to load prediction."));
      }
    } finally {
      if (isCurrent()) {
        setPredictionLoading(false);
      }
    }
  }, []);

  /* ============================================================
   * START LOAD (analysis + prediction)
   * ============================================================ */

  const startLoad = useCallback(
    (gstinValue, reset) => {
      analysisControllerRef.current?.abort();

      const controller = new AbortController();

      analysisControllerRef.current = controller;

      if (reset) {
        setAnalysis(null);
        setPrediction(null);
        setError("");
        setPredictionError("");
        setActiveTab("overview");
      }

      loadAnalysis(gstinValue, controller.signal);
      loadPrediction(gstinValue);
    },
    [loadAnalysis, loadPrediction],
  );

  /* ============================================================
   * ANALYZE / REFRESH / RETRY
   * ============================================================ */

  const handleAnalyze = useCallback(
    (cleanGstin) => {
      setSelectedGstin(cleanGstin);
      startLoad(cleanGstin, true);
    },
    [startLoad],
  );

  const handleRefresh = useCallback(() => {
    if (!selectedGstin || isBusy) {
      return;
    }

    startLoad(selectedGstin, false);
  }, [selectedGstin, isBusy, startLoad]);

  const handleRetryPrediction = useCallback(
    () => loadPrediction(selectedGstin),
    [loadPrediction, selectedGstin],
  );

  const handleViewHistory = useCallback(() => setActiveTab("history"), []);
  const handleViewRisk = useCallback(() => setActiveTab("risk"), []);

  /* ============================================================
   * INITIAL GSTIN
   * ============================================================ */

  useEffect(() => {
    const initial = normalizeGstin(initialGstin);

    if (!initial || !isValidGstin(initial)) {
      return undefined;
    }

    setSelectedGstin(initial);
    startLoad(initial, true);

    return () => {
      analysisControllerRef.current?.abort();
    };
  }, [initialGstin, startLoad]);

  /* ============================================================
   * CLEANUP ON UNMOUNT
   * ============================================================ */

  useEffect(
    () => () => {
      analysisControllerRef.current?.abort();
      predictionRequestRef.current += 1;
    },
    [],
  );

  /* ============================================================
   * HISTORY
   * ============================================================ */

  const history = useMemo(() => {
    if (!Array.isArray(analysis?.last6MonthsHistory)) {
      return EMPTY_LIST;
    }

    return analysis.last6MonthsHistory
      .map((item) => ({ item, key: periodSortKey(item?.retPeriod) }))
      .sort((a, b) => b.key.localeCompare(a.key))
      .map(({ item }) => item);
  }, [analysis]);

  /* ============================================================
   * TOTALS
   * ============================================================ */

  const totals = useMemo(() => {
    const historyTotal = (field) =>
      history.reduce((sum, item) => sum + safeNumber(item?.[field]), 0);

    // The API already returns authoritative lifetime aggregate values.
    // Do not replace them with a zero sum merely because history exists.
    const pickAmount = (lifetimeValue, historyField, alternateValue) => {
      if (hasValue(lifetimeValue)) {
        return safeNumber(lifetimeValue);
      }

      if (hasValue(alternateValue)) {
        return safeNumber(alternateValue);
      }

      return historyTotal(historyField);
    };

    return {
      taxableValue: pickAmount(
        analysis?.lifetimeTaxableValue ?? analysis?.lifetaxableValue,
        "taxableValue",
      ),
      igst: pickAmount(analysis?.lifetimeIgst, "igst", analysis?.totalIGST),
      cgst: pickAmount(analysis?.lifetimeCgst, "cgst", analysis?.totalCGST),
      sgst: pickAmount(analysis?.lifetimeSgst, "sgst", analysis?.totalSGST),
      cess: pickAmount(analysis?.lifetimeCess, "cess", analysis?.totalCESS),
      outputTax: pickAmount(
        analysis?.lifetimeOutputTax,
        "outputTax",
        analysis?.totalOutputTax,
      ),
      itc: pickAmount(
        analysis?.lifetimeItcUtilized,
        "itcClaimed",
        analysis?.totalITCClaimed,
      ),
      cash: pickAmount(
        analysis?.lifetimeCashPaid,
        "cashPaid",
        analysis?.totalCashPaid,
      ),
      rcm: pickAmount(
        analysis?.lifetimeRcmTax,
        "rcmTax",
        analysis?.totalRCMTax,
      ),
      itcEligible: pickAmount(
        analysis?.lifetimeItcEligible,
        "itcEligible",
        analysis?.totalITCEligible,
      ),
      excessItc: safeNumber(analysis?.lifetimeExcessItc),
      returnCount:
        analysis?.totalReturns != null
          ? safeNumber(analysis.totalReturns)
          : history.length,
    };
  }, [history, analysis]);

  /* ============================================================
   * COMPLIANCE METRICS
   * ============================================================ */

  const averageCashRatio = useMemo(() => {
    if (hasValue(analysis?.cashPaymentRatio)) {
      return safeNumber(analysis.cashPaymentRatio);
    }

    const outputTax = safeNumber(analysis?.lifetimeOutputTax);
    const cashPaid = safeNumber(analysis?.lifetimeCashPaid);

    if (outputTax > 0) {
      return cashPaid / outputTax;
    }

    if (!history.length) {
      return 0;
    }

    return (
      history.reduce((sum, item) => sum + safeNumber(item?.cashRatio), 0) /
      history.length
    );
  }, [history, analysis]);

  const averageItcRatio = useMemo(() => {
    if (hasValue(analysis?.itcUtilizationRatio)) {
      return safeNumber(analysis.itcUtilizationRatio);
    }

    const outputTax = safeNumber(analysis?.lifetimeOutputTax);
    const utilizedItc = safeNumber(analysis?.lifetimeItcUtilized);

    if (outputTax > 0) {
      return utilizedItc / outputTax;
    }

    if (!history.length) {
      return 0;
    }

    return (
      history.reduce((sum, item) => sum + safeNumber(item?.itcRatio), 0) /
      history.length
    );
  }, [history, analysis]);

  const delayedReturns = useMemo(() => {
    if (!history.length) {
      return safeNumber(analysis?.delayedReturns);
    }

    return history.filter(
      (item) =>
        String(item?.filingStatus || "").toUpperCase() === "DELAYED" ||
        safeNumber(item?.filingDelayDays) > 0,
    ).length;
  }, [history, analysis]);

  const alerts = Array.isArray(analysis?.activeAlerts)
    ? analysis.activeAlerts
    : EMPTY_LIST;

  /* ============================================================
   * BODY
   * ============================================================ */

  let body = null;

  if (!analysis) {
    if (loading) {
      body = <LoadingState />;
    } else if (error) {
      body = <AnalysisError message={error} onRetry={handleRefresh} />;
    }
  } else {
    body = (
      <>
        <TaxpayerProfile analysis={analysis} returnCount={totals.returnCount} />

        <div className="px-2 px-sm-3 px-lg-4">
          <div className="card border-0 shadow-sm rounded-3 mb-4 bg-light">
            <div
              className="d-flex flex-wrap align-items-center gap-2 p-2"
              role="tablist"
              aria-label="GSTIN analysis sections"
            >
              {TABS.map((tab) => (
                <TabButton
                  key={tab.id}
                  id={tab.id}
                  label={tab.label}
                  Icon={tab.Icon}
                  active={activeTab === tab.id}
                  onSelect={setActiveTab}
                />
              ))}
            </div>
          </div>
        </div>

        <div
          className="px-2 px-sm-3 px-lg-4 pb-4"
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
        >
          {activeTab === "overview" && (
            <>
              <div className="row g-3 mb-3">
                <div className="col-12 col-xl-6">
                  <TaxSummaryPanel totals={totals} />
                </div>

                <div className="col-12 col-xl-6">
                  <ComplianceIndicatorsPanel
                    itcRatio={averageItcRatio}
                    cashRatio={averageCashRatio}
                    returnCount={totals.returnCount}
                  />
                </div>
              </div>

              <RecentHistory history={history} onViewAll={handleViewHistory} />

              <AlertsPanel alerts={alerts} onViewAll={handleViewRisk} />
            </>
          )}

          {activeTab === "history" && <HistoryTable history={history} />}

          {activeTab === "tax" && (
            <TaxBreakdown history={history} totals={totals} />
          )}

          {activeTab === "risk" && (
            <RiskSection
              analysis={analysis}
              alerts={alerts}
              delayedReturns={delayedReturns}
            />
          )}

          {activeTab === "prediction" && (
            <PredictionSection
              prediction={prediction}
              loading={predictionLoading}
              error={predictionError}
              onRetry={handleRetryPrediction}
            />
          )}
        </div>
      </>
    );
  }

  return (
    <div className="gst-analysis-page" aria-busy={loading}>
      <SearchHeader
        initialGstin={initialGstin}
        loading={loading}
        busy={isBusy}
        canRefresh={Boolean(analysis)}
        onAnalyze={handleAnalyze}
        onRefresh={handleRefresh}
        onBack={onBack}
      />

      {body}
    </div>
  );
};

/* ============================================================
 * SEARCH HEADER
 *
 * Owns the GSTIN input state so typing re-renders only this
 * component and never the (large) dashboard below it.
 * ============================================================ */

const SearchHeader = memo(function SearchHeader({
  initialGstin,
  loading,
  busy,
  canRefresh,
  onAnalyze,
  onRefresh,
  onBack,
}) {
  const [gstinInput, setGstinInput] = useState(() =>
    normalizeGstin(initialGstin),
  );
  const [inputError, setInputError] = useState("");

  useEffect(() => {
    const initial = normalizeGstin(initialGstin);

    if (initial && isValidGstin(initial)) {
      setGstinInput(initial);
    }
  }, [initialGstin]);

  const handleChange = useCallback((event) => {
    const value = normalizeGstin(event.target.value);

    setGstinInput(value.substring(0, GSTIN_LENGTH));
    setInputError("");
  }, []);

  const handleSubmit = useCallback(
    (event) => {
      event?.preventDefault();

      const cleanGstin = normalizeGstin(gstinInput);

      if (!cleanGstin) {
        setInputError("Please enter a GSTIN.");
        return;
      }

      if (!isValidGstin(cleanGstin)) {
        setInputError("Please enter a valid 15-character GSTIN.");
        return;
      }

      setInputError("");
      onAnalyze(cleanGstin);
    },
    [gstinInput, onAnalyze],
  );

  return (
    <header
      className="officer-topbar border-bottom sticky-top bg-white bg-opacity-95 backdrop-blur shadow-sm"
      style={{
        zIndex: 1000,
        backdropFilter: "blur(8px)",
        borderColor: "rgba(226, 232, 240, 0.8)",
      }}
    >
      <div className="container-fluid px-3 px-lg-4 py-2.5 py-md-3">
        <div className="d-flex flex-column flex-xl-row justify-content-between align-items-stretch align-items-xl-center gap-3">
          {/* PAGE BRANDING & TITLE */}
          <div className="d-flex align-items-center gap-3 flex-shrink-0">
            <div
              className="officer-logo-box rounded-3 d-flex align-items-center justify-content-center text-primary shadow-xs"
              style={{
                width: 42,
                height: 42,
                backgroundColor: "rgba(13, 110, 253, 0.08)",
                border: "1px solid rgba(13, 110, 253, 0.15)",
              }}
            >
              <FaIdBadge size={20} />
            </div>
            <div className="min-width-0">
              <h5
                className="fw-bold text-dark mb-0 text-truncate mt-1"
                style={{ fontSize: "1.05rem", letterSpacing: "-0.2px" }}
              >
                GSTR-3B Return Compliance &amp; AI Risk Assessment
              </h5>
            </div>
          </div>

          {/* CONTROLS & ACTIONS */}
          <div className="d-flex flex-wrap align-items-center justify-content-xl-end gap-2.5 flex-grow-1">
            <form
              onSubmit={handleSubmit}
              noValidate
              className="d-flex align-items-center flex-grow-1"
              style={{ maxWidth: "520px" }}
            >
              <div
                className={`input-group rounded-3 transition-all flex-grow-1 ${
                  inputError
                    ? "border border-danger shadow-sm"
                    : "border shadow-xs"
                }`}
                style={{ backgroundColor: "#f8fafc" }}
              >
                <span className="input-group-text bg-transparent border-0 py-1.5 ps-3 pe-2">
                  <FaSearch size={14} className="text-secondary" />
                </span>

                {/* No maxLength attribute: it would truncate a pasted value
                    that contains spaces before it can be normalised. The
                    change handler enforces the 15 character limit. */}
                <input
                  id="gstin-analysis-input"
                  type="text"
                  value={gstinInput}
                  onChange={handleChange}
                  placeholder="Enter 15-character GSTIN (e.g., 27AAAAA0000A1Z5)"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-label="GSTIN"
                  aria-invalid={Boolean(inputError)}
                  aria-describedby={inputError ? "gstin-input-error" : undefined}
                  className="form-control bg-transparent border-0 py-1.5 px-2 shadow-none"
                  style={{
                    height: "38px",
                    fontSize: "0.88rem",
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontWeight: 600,
                    letterSpacing: "0.6px",
                    textTransform: "uppercase",
                    color: "#0f172a",
                    WebkitTextFillColor: "#0f172a",
                    caretColor: "#0f172a",
                    opacity: 1,
                  }}
                />

                <span className="input-group-text bg-transparent border-0 py-1.5 pe-3 ps-1">
                  <span
                    className={`badge rounded-pill fw-semibold ${
                      gstinInput.length === GSTIN_LENGTH
                        ? "bg-success-subtle text-success"
                        : "bg-secondary-subtle text-secondary"
                    }`}
                    style={{ fontSize: "0.7rem" }}
                  >
                    {gstinInput.length}/{GSTIN_LENGTH}
                  </span>
                </span>
              </div>

              <button
                type="submit"
                className="btn btn-primary rounded-3 d-flex align-items-center justify-content-center gap-1.5 shadow-sm ms-2 px-3.5 fw-medium"
                style={{
                  fontSize: "0.85rem",
                  height: "38px",
                  whiteSpace: "nowrap",
                  transition: "all 0.2s ease",
                }}
                disabled={busy || !gstinInput}
              >
                {loading ? (
                  <>
                    <FaSpinner className="spin" size={13} />
                    <span className="d-none d-sm-inline">Analyzing...</span>
                  </>
                ) : (
                  <>
                    <FaSearch size={13} />
                    <span className="d-none d-sm-inline">Analyze</span>
                  </>
                )}
              </button>
            </form>

            {/* REFRESH BUTTON */}
            {canRefresh && (
              <button
                type="button"
                className="btn btn-light border rounded-3 d-flex align-items-center justify-content-center gap-1.5 shadow-xs px-3 text-secondary fw-medium"
                style={{
                  fontSize: "0.85rem",
                  height: "38px",
                  backgroundColor: "#ffffff",
                }}
                disabled={busy}
                onClick={onRefresh}
              >
                <FaSyncAlt size={12} className={loading ? "spin" : ""} />
                <span className="d-none d-sm-inline">Refresh</span>
              </button>
            )}

            {/* BACK BUTTON */}
            {onBack && (
              <button
                type="button"
                className="btn btn-outline-secondary rounded-3 px-3 fw-medium"
                style={{ height: "38px", fontSize: "0.85rem" }}
                onClick={onBack}
              >
                ← Back
              </button>
            )}
          </div>
        </div>

        {/* INPUT ERROR ALERT */}
        {inputError && (
          <div
            id="gstin-input-error"
            role="alert"
            className="mt-2 text-danger d-flex align-items-center gap-1.5 ps-1"
          >
            <FaExclamationCircle size={13} />
            <span style={{ fontSize: "0.78rem", fontWeight: 500 }}>
              {inputError}
            </span>
          </div>
        )}
      </div>
    </header>
  );
});

/* ============================================================
 * LOADING / ERROR STATES
 * ============================================================ */

const LoadingState = memo(function LoadingState() {
  return (
    <div className="px-2 px-sm-3 px-lg-4">
      <div className="card border-0 shadow-sm rounded-3">
        <div className="card-body py-5 text-center">
          <div
            className="bg-primary-subtle text-primary rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3"
            style={{ width: 52, height: 52 }}
          >
            <FaSpinner className="spin" size={22} />
          </div>

          <h5 className="fw-bold text-dark mb-1">Loading GSTIN Analysis</h5>

          <p className="text-muted small mb-0" role="status">
            Fetching GSTR-3B history, tax profile and compliance information...
          </p>
        </div>
      </div>
    </div>
  );
});

const AnalysisError = memo(function AnalysisError({ message, onRetry }) {
  return (
    <div className="px-2 px-sm-3 px-lg-4">
      <div className="card border-0 shadow-sm rounded-3" role="alert">
        <div className="card-body p-4">
          <div className="d-flex align-items-start gap-3 text-danger">
            <div
              className="bg-danger-subtle rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              style={{ width: 42, height: 42 }}
            >
              <FaExclamationCircle />
            </div>

            <div>
              <h6 className="fw-bold mb-1">Unable to Load GSTIN Analysis</h6>

              <p className="text-muted mb-3 small">{message}</p>

              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={onRetry}
              >
                <FaSyncAlt className="me-1" />
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

/* ============================================================
 * TAXPAYER PROFILE
 * ============================================================ */

const TaxpayerProfile = memo(function TaxpayerProfile({
  analysis,
  returnCount,
}) {
  const statusLabel = getStatusLabel(analysis.status);
  const isActive = statusLabel === "ACTIVE";

  return (
    <div className="px-2 px-sm-3 px-lg-4">
      <div className="card border-0 shadow-sm rounded-3 mb-4 overflow-hidden">
        <div className="card-body p-0">
          <div className="row g-0">
            {/* 1. GSTIN */}
            <div className="col-12 col-sm-6 col-xl-3 p-3 p-md-4 bg-primary bg-opacity-10 border-end border-bottom border-xl-bottom-0">
              <div className="d-flex align-items-start gap-3">
                <div
                  className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0 bg-primary text-white shadow-sm"
                  style={{ width: 42, height: 42 }}
                >
                  <FaBuilding size={18} />
                </div>

                <div className="min-width-0 flex-grow-1">
                  <div
                    className="text-uppercase fw-bold text-muted mb-1"
                    style={{ fontSize: "0.68rem", letterSpacing: "0.5px" }}
                  >
                    GST Identification Number
                  </div>

                  <div
                    className="fw-bold text-dark text-truncate fs-6 mb-2 font-monospace"
                    title={displayText(analysis.gstin)}
                    style={{ letterSpacing: "0.5px" }}
                  >
                    {displayText(analysis.gstin)}
                  </div>

                  <div className="d-flex align-items-center gap-2">
                    <span
                      className={`badge rounded-2 fw-semibold px-2 py-1 d-inline-flex align-items-center gap-1 ${
                        isActive
                          ? "bg-success text-white"
                          : "bg-warning text-dark"
                      }`}
                      style={{ fontSize: "0.72rem" }}
                    >
                      <FaCheckCircle size={10} />
                      {statusLabel}
                    </span>
                    <span
                      className="text-muted small fw-medium"
                      style={{ fontSize: "0.72rem" }}
                    >
                      Status
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. TAXPAYER */}
            <div className="col-12 col-sm-6 col-xl-3 p-3 p-md-4 bg-secondary bg-opacity-10 border-end border-bottom border-xl-bottom-0">
              <div className="d-flex align-items-start gap-3">
                <div
                  className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0 bg-secondary text-white shadow-sm"
                  style={{ width: 42, height: 42 }}
                >
                  <FaUserTie size={17} />
                </div>

                <div className="min-width-0 flex-grow-1">
                  <div
                    className="text-uppercase fw-bold text-muted mb-1"
                    style={{ fontSize: "0.68rem", letterSpacing: "0.5px" }}
                  >
                    Taxpayer
                  </div>

                  <div
                    className="fw-bold text-dark text-truncate fs-6 mb-1"
                    title={displayText(analysis.legalName)}
                  >
                    {displayText(analysis.legalName)}
                  </div>

                  {analysis.tradeName && (
                    <div
                      className="text-muted small text-truncate fw-medium"
                      title={displayText(analysis.tradeName)}
                      style={{ fontSize: "0.78rem" }}
                    >
                      {displayText(analysis.tradeName)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 3. JURISDICTION */}
            <div className="col-12 col-sm-6 col-xl-3 p-3 p-md-4 bg-light border-end border-bottom border-sm-bottom-0">
              <div className="d-flex align-items-start gap-3">
                <div
                  className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0 bg-dark text-white shadow-sm"
                  style={{ width: 42, height: 42 }}
                >
                  <FaLandmark size={16} />
                </div>

                <div className="min-width-0 flex-grow-1">
                  <div
                    className="text-uppercase fw-bold text-muted mb-1"
                    style={{ fontSize: "0.68rem", letterSpacing: "0.5px" }}
                  >
                    Jurisdiction
                  </div>

                  <div
                    className="fw-bold text-dark text-truncate"
                    title={displayText(analysis.jurisdiction)}
                    style={{ fontSize: "0.9rem" }}
                  >
                    {displayText(analysis.jurisdiction)}
                  </div>
                </div>
              </div>
            </div>

            {/* 4. RETURNS LOGGED */}
            <div className="col-12 col-sm-6 col-xl-3 p-3 p-md-4 bg-dark bg-opacity-10 border-end border-bottom border-sm-bottom-0">
              <div className="d-flex align-items-center gap-3 h-100">
                <div
                  className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0 bg-dark text-white shadow-sm"
                  style={{ width: 42, height: 42 }}
                >
                  <span
                    className="fw-bold font-monospace"
                    style={{ fontSize: "0.85rem" }}
                  >
                    3B
                  </span>
                </div>

                <div className="min-width-0 flex-grow-1">
                  <div
                    className="text-uppercase fw-bold text-muted mb-1"
                    style={{ fontSize: "0.68rem", letterSpacing: "0.5px" }}
                  >
                    Returns Logged
                  </div>

                  <div className="d-flex align-items-baseline gap-2">
                    <span className="fw-bold text-dark fs-4 lh-1 font-monospace">
                      {returnCount}
                    </span>
                    <span
                      className="text-muted fw-medium"
                      style={{ fontSize: "0.78rem" }}
                    >
                      Months
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

/* ============================================================
 * TAX SUMMARY PANEL
 * ============================================================ */

const TaxSummaryPanel = memo(function TaxSummaryPanel({ totals }) {
  return (
    <div className="card border shadow-sm rounded-3 h-100 bg-white">
      <PanelHeader
        icon={<FaFileInvoiceDollar style={{ color: "#6f42c1" }} />}
        title="Tax Summary"
        subtitle="Aggregated GSTR-3B values"
      />

      <div className="card-body p-3 d-flex flex-column gap-3">
        {TAX_SUMMARY_ITEMS.map((item) => (
          <div
            key={item.key}
            className="p-3 rounded-3 border"
            style={{
              backgroundColor: item.bgTint,
              borderColor: item.borderColor,
            }}
          >
            <div className="d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-2">
                <span
                  className="badge rounded-1 text-white fw-bold shadow-sm"
                  style={{
                    backgroundColor: item.color,
                    fontSize: "0.72rem",
                    padding: "5px 9px",
                    minWidth: "90px",
                    textAlign: "center",
                  }}
                >
                  {item.label}
                </span>

                <span
                  className="text-uppercase fw-bold"
                  style={{
                    fontSize: "0.68rem",
                    letterSpacing: "0.4px",
                    color: "#64748b",
                  }}
                >
                  GSTR-3B
                </span>
              </div>

              <div className="text-end">
                <span
                  className="fw-bold font-monospace fs-6"
                  style={{ color: "#111827" }}
                >
                  {formatINRCompact(Number(totals?.[item.key]) || 0)}
                </span>
              </div>
            </div>
          </div>
        ))}

        <DarkSummaryBar
          label="Total Output Tax"
          valueClass="fs-5"
          value={formatINRCompact(Number(totals?.outputTax) || 0)}
        />
      </div>
    </div>
  );
});

/* ============================================================
 * COMPLIANCE INDICATORS PANEL
 * ============================================================ */

const ComplianceIndicatorsPanel = memo(function ComplianceIndicatorsPanel({
  itcRatio,
  cashRatio,
  returnCount,
}) {
  const ratios = { itc: itcRatio, cash: cashRatio };

  return (
    <div className="card border shadow-sm rounded-3 h-100 bg-white">
      <PanelHeader
        icon={<FaPercentage style={{ color: "#0284c7" }} />}
        title="Compliance Indicators"
        subtitle="Calculated from analysed returns"
      />

      <div className="card-body p-3 d-flex flex-column gap-3">
        {COMPLIANCE_ITEMS.map((item) => {
          // Ratios are decimals: 0.25 = 25%.
          const percent = (Number(ratios[item.key]) || 0) * 100;
          const formatted = percent.toFixed(2);
          const progressWidth = clampPercent(percent).toFixed(2);

          return (
            <div
              key={item.key}
              className="p-3 rounded-3 border"
              style={{
                backgroundColor: item.bgTint,
                borderColor: item.borderColor,
              }}
            >
              <div className="d-flex align-items-center justify-content-between mb-2">
                <div className="d-flex align-items-center gap-2">
                  <span
                    className="badge rounded-1 text-white fw-bold shadow-sm"
                    style={{
                      backgroundColor: item.color,
                      fontSize: "0.72rem",
                      padding: "5px 9px",
                    }}
                  >
                    {item.badge}
                  </span>

                  <span
                    className="text-uppercase fw-bold"
                    style={{
                      fontSize: "0.68rem",
                      letterSpacing: "0.5px",
                      color: "#64748b",
                    }}
                  >
                    Average Ratio
                  </span>
                </div>

                <span
                  className="fw-bold font-monospace fs-6"
                  style={{ color: "#111827" }}
                >
                  {formatted}%
                </span>
              </div>

              <div
                className="progress rounded-pill"
                style={{
                  height: "6px",
                  backgroundColor: "rgba(255, 255, 255, 0.7)",
                }}
              >
                <div
                  className="progress-bar rounded-pill"
                  role="progressbar"
                  style={{
                    width: `${progressWidth}%`,
                    backgroundColor: item.color,
                  }}
                  aria-valuenow={Number(formatted)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${item.label}: ${formatted}%`}
                />
              </div>
            </div>
          );
        })}

        <DarkSummaryBar
          label="Analysed Returns"
          valueClass="fs-6"
          value={Number(returnCount || 0).toLocaleString("en-IN")}
        />
      </div>
    </div>
  );
});

/* ============================================================
 * DARK SUMMARY BAR (shared footer)
 * ============================================================ */

const DarkSummaryBar = memo(function DarkSummaryBar({
  label,
  value,
  valueClass,
}) {
  return (
    <div
      className="p-3 rounded-3 text-white d-flex align-items-center justify-content-between shadow-sm"
      style={{ backgroundColor: "#1e293b" }}
    >
      <div className="d-flex align-items-center gap-2">
        <span
          className="rounded-circle d-inline-block"
          style={{ width: "8px", height: "8px", backgroundColor: "#10b981" }}
        />

        <span
          className="text-uppercase fw-bold"
          style={{
            fontSize: "0.72rem",
            letterSpacing: "0.5px",
            color: "#94a3b8",
          }}
        >
          {label}
        </span>
      </div>

      <strong
        className={`font-monospace fw-bold ${valueClass}`}
        style={{ color: "#f8fafc" }}
      >
        {value}
      </strong>
    </div>
  );
});

/* ============================================================
 * KPI CARD
 * ============================================================ */

const KPI_ACCENTS = {
  primary: {
    border: "border-primary",
    text: "text-primary",
    bg: "bg-primary-subtle",
  },
  success: {
    border: "border-success",
    text: "text-success",
    bg: "bg-success-subtle",
  },
  purple: { border: "", text: "", bg: "" },
};

const KpiCard = memo(function KpiCard({ title, value, detail, icon, accent }) {
  const config = KPI_ACCENTS[accent] || KPI_ACCENTS.primary;
  const isPurple = accent === "purple";

  return (
    <div
      className={`card border-0 shadow-sm rounded-3 h-100 bg-white border-start border-4 ${config.border}`}
      style={isPurple ? { borderLeftColor: "#6f42c1" } : undefined}
    >
      <div className="card-body p-3">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <span className="officer-label">{title}</span>

          <div
            className={`p-2 rounded-circle ${isPurple ? "" : config.bg}`}
            style={
              isPurple
                ? { backgroundColor: "#f3ebf9", color: "#6f42c1" }
                : undefined
            }
          >
            {React.cloneElement(icon, { size: 15 })}
          </div>
        </div>

        <h4
          className={`fw-bold mb-1 font-monospace text-truncate ${
            isPurple ? "" : config.text
          }`}
          style={isPurple ? { color: "#6f42c1" } : undefined}
          title={value}
        >
          {value}
        </h4>

        <span className="text-muted small">{detail}</span>
      </div>
    </div>
  );
});

/* ============================================================
 * TABLE CELLS (shared by both history tables)
 * ============================================================ */

const PeriodCell = memo(function PeriodCell({ item, officer = false }) {
  return (
    <td
      className={`px-3 py-2 fw-bold${officer ? " officer-period-cell" : ""}`}
      style={{ color: "#212529" }}
    >
      <span
        className={`d-block${officer ? " officer-period-value" : ""}`}
        style={{ fontSize: "14px" }}
      >
        {item.formattedPeriod || formatReturnPeriod(item.retPeriod)}
      </span>
      <small className="d-block text-muted" style={{ fontSize: "12px" }}>
        {item.retPeriod}
      </small>
    </td>
  );
});

const ValueCell = ({ children, color, bold = false, weight }) => (
  <td
    className={`px-2 text-end font-monospace text-nowrap${
      bold ? " fw-bold" : ""
    }`}
    style={{
      color,
      fontSize: "14px",
      ...(weight ? { fontWeight: weight } : null),
    }}
  >
    {children}
  </td>
);

const DelayCell = ({ days }) => {
  const delayDays = safeNumber(days);

  return (
    <td className="text-center fw-bold" style={{ fontSize: "14px" }}>
      <span
        className={`officer-delay-badge fw-bold ${getDelayBadgeClass(days)}`}
        style={{ fontSize: "13px" }}
      >
        {delayDays > 0 && <span className="officer-delay-dot" />}
        {delayDays} {delayDays === 1 ? "day" : "days"}
      </span>
    </td>
  );
};

const StatusCell = ({ status }) => (
  <td className="text-center fw-bold" style={{ fontSize: "14px" }}>
    <span
      className={`officer-filing-badge fw-bold ${getFilingBadgeClass(status)}`}
      style={{ fontSize: "13px" }}
    >
      {status}
    </span>
  </td>
);

/* ============================================================
 * RECENT HISTORY
 * ============================================================ */

const RecentHistoryRow = memo(function RecentHistoryRow({ item }) {
  return (
    <tr>
      <PeriodCell item={item} officer />
      <ValueCell color="#0d6efd" weight={600}>
        {formatINR(item.taxableValue)}
      </ValueCell>
      <ValueCell color="#3730a3">{formatINR(item.outputTax)}</ValueCell>
      <ValueCell color="#198754">{formatINR(item.itcClaimed)}</ValueCell>
      <ValueCell color="#059669">{formatINR(item.cashPaid)}</ValueCell>
      <DelayCell days={item.filingDelayDays} />
      <StatusCell status={item.filingStatus || "FILED"} />
    </tr>
  );
});

const RecentHistory = memo(function RecentHistory({ history, onViewAll }) {
  const rows = useMemo(
    () => (Array.isArray(history) ? history.slice(0, RECENT_HISTORY_ROWS) : []),
    [history],
  );

  return (
    <div className="card officer-history-card mb-3">
      <div className="card-body p-0">
        <PanelHeader
          icon={<FaHistory />}
          title="Recent GSTR-3B Returns"
          subtitle="Latest analysed return periods"
          action={
            <button
              type="button"
              className="btn btn-sm officer-view-all-btn"
              onClick={onViewAll}
            >
              View All
              <FaChevronRight size={11} />
            </button>
          }
        />

        {rows.length === 0 ? (
          <div className="officer-history-empty">
            <EmptyState message="No GSTR-3B history available." />
          </div>
        ) : (
          <div className="table-responsive officer-history-table-wrapper">
            <table
              className="table table-hover align-middle mb-0 officer-history-table"
              style={{ fontSize: "14px" }}
            >
              <thead
                className="table-dark text-uppercase border-bottom"
                style={{ fontSize: "0.75rem", letterSpacing: "0.5px" }}
              >
                <tr>
                  <th
                    scope="col"
                    className="py-3 px-3 border-0 officer-period-column"
                  >
                    Period
                  </th>
                  <th scope="col" className="py-3 px-2 border-0 text-end">
                    Taxable Value
                  </th>
                  <th scope="col" className="py-3 px-2 border-0 text-end">
                    Output Tax
                  </th>
                  <th scope="col" className="py-3 px-2 border-0 text-end">
                    ITC Claimed
                  </th>
                  <th scope="col" className="py-3 px-2 border-0 text-end">
                    Cash Paid
                  </th>
                  <th scope="col" className="py-3 px-2 border-0 text-center">
                    Filing Delay
                  </th>
                  <th scope="col" className="py-3 px-2 border-0 text-center">
                    Filing Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((item, index) => (
                  <RecentHistoryRow
                    key={item.retPeriod || index}
                    item={item}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
});

/* ============================================================
 * HISTORY TABLE
 * ============================================================ */

const HistoryRow = memo(function HistoryRow({ item }) {
  return (
    <tr>
      <PeriodCell item={item} />
      <ValueCell color="#0d6efd" weight={600}>
        {formatINR(item.taxableValue ?? item.taxValue ?? item.taxvalues)}
      </ValueCell>
      <ValueCell color="#6f42c1" bold>
        {formatINR(item.igst)}
      </ValueCell>
      <ValueCell color="#0d9488" bold>
        {formatINR(item.cgst)}
      </ValueCell>
      <ValueCell color="#0284c7" bold>
        {formatINR(item.sgst)}
      </ValueCell>
      <ValueCell color="#fd7e14" bold>
        {formatINR(item.cess)}
      </ValueCell>
      <ValueCell color="#3730a3" bold>
        {formatINR(item.outputTax)}
      </ValueCell>
      <ValueCell color="#198754" bold>
        {formatINR(item.itcClaimed)}
      </ValueCell>
      <ValueCell color="#059669" bold>
        {formatINR(item.cashPaid)}
      </ValueCell>
      <ValueCell color="#d63384" bold>
        {formatINR(item.rcmTax)}
      </ValueCell>
      <ValueCell color="#0891b2" bold>
        {formatPercentage(item.itcRatio)}
      </ValueCell>
      <ValueCell color="#475569" bold>
        {formatPercentage(item.cashRatio)}
      </ValueCell>
      <DelayCell days={item.filingDelayDays} />
      <StatusCell status={item.filingStatus || "FILED"} />
    </tr>
  );
});

const HISTORY_COLUMNS = [
  { label: "Period", className: "py-3 px-3 border-0" },
  { label: "Taxable Value", className: "py-3 px-2 border-0 text-end" },
  { label: "IGST", className: "py-3 px-2 border-0 text-end" },
  { label: "CGST", className: "py-3 px-2 border-0 text-end" },
  { label: "SGST", className: "py-3 px-2 border-0 text-end" },
  { label: "CESS", className: "py-3 px-2 border-0 text-end" },
  { label: "Output Tax", className: "py-3 px-2 border-0 text-end" },
  { label: "ITC Claimed", className: "py-3 px-2 border-0 text-end" },
  { label: "Cash Paid", className: "py-3 px-2 border-0 text-end" },
  { label: "RCM Tax", className: "py-3 px-2 border-0 text-end" },
  { label: "ITC Ratio", className: "py-3 px-2 border-0 text-end" },
  { label: "Cash Ratio", className: "py-3 px-2 border-0 text-end" },
  { label: "Delay", className: "py-3 px-2 border-0 text-center" },
  { label: "Status", className: "py-3 px-2 border-0 text-center" },
];

const HistoryTable = memo(function HistoryTable({ history }) {
  return (
    <div className="card officer-history-card mb-3">
      <div className="card-body p-0">
        <PanelHeader
          icon={<FaTable />}
          title="GSTR-3B Return History"
          subtitle="Complete analysed return history"
        />

        {history.length === 0 ? (
          <div className="officer-history-empty">
            <EmptyState message="No GSTR-3B return history found." />
          </div>
        ) : (
          <div className="table-responsive officer-complete-history-wrapper">
            <table
              className="table table-hover align-middle mb-0 officer-complete-history"
              style={{ fontSize: "14px" }}
            >
              <thead
                className="table-dark text-uppercase border-bottom"
                style={{ fontSize: "0.75rem", letterSpacing: "0.5px" }}
              >
                <tr>
                  {HISTORY_COLUMNS.map((column) => (
                    <th
                      key={column.label}
                      scope="col"
                      className={column.className}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {history.map((item, index) => (
                  <HistoryRow key={item.retPeriod || index} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
});

/* ============================================================
 * TAX BREAKDOWN
 * ============================================================ */

const MonthColumn = memo(function MonthColumn({ item, maxValue }) {
  const outputTax = safeNumber(item.outputTax);
  const itcClaimed = safeNumber(item.itcClaimed);
  const cashPaid = safeNumber(item.cashPaid);

  const outputHeight = (outputTax / maxValue) * 100;
  const itcHeight = (itcClaimed / maxValue) * 100;
  const cashHeight = (cashPaid / maxValue) * 100;

  return (
    <div className="officer-month-column">
      <div className="officer-month-values">
        <span
          className="officer-chart-value officer-chart-output"
          title={`Output Tax: ${formatINR(outputTax)}`}
        >
          {formatINR(outputTax)}
        </span>

        <span
          className="officer-chart-value officer-chart-itc"
          title={`ITC: ${formatINR(itcClaimed)}`}
        >
          {formatINR(itcClaimed)}
        </span>

        <span
          className="officer-chart-value officer-chart-cash"
          title={`Cash Paid: ${formatINR(cashPaid)}`}
        >
          {formatINR(cashPaid)}
        </span>
      </div>

      <div className="officer-month-bars">
        <div
          className="officer-tax-bar officer-output-bar"
          style={{
            height: `${Math.max(outputHeight, outputTax > 0 ? 3 : 0)}%`,
          }}
          title={`Output Tax: ${formatINR(outputTax)}`}
        />

        <div
          className="officer-tax-bar officer-itc-bar"
          style={{
            height: `${Math.max(itcHeight, itcClaimed > 0 ? 3 : 0)}%`,
          }}
          title={`ITC Claimed: ${formatINR(itcClaimed)}`}
        />

        <div
          className="officer-tax-bar officer-cash-bar"
          style={{
            height: `${Math.max(cashHeight, cashPaid > 0 ? 3 : 0)}%`,
          }}
          title={`Cash Paid: ${formatINR(cashPaid)}`}
        />
      </div>

      <div className="officer-month-period">
        {item.formattedPeriod || formatReturnPeriod(item.retPeriod)}
      </div>
    </div>
  );
});

const TaxBreakdown = memo(function TaxBreakdown({
  history = EMPTY_LIST,
  totals = {},
}) {
  const outputTaxTotal = Number(safeNumber(totals.outputTax)) || 0;

  // Computed once per history change instead of once per month column.
  const maxValue = useMemo(
    () =>
      Math.max(
        ...history.map((row) =>
          Math.max(
            safeNumber(row.outputTax),
            safeNumber(row.itcClaimed),
            safeNumber(row.cashPaid),
          ),
        ),
        1,
      ),
    [history],
  );

  return (
    <div className="gst-tax-breakdown">
      <div className="row g-3 mb-3">
        {/* GST TAX COMPOSITION PANEL */}
        <div className="col-12 col-xl-6">
          <div className="card border shadow-sm rounded-3 h-100 bg-white">
            <PanelHeader
              icon={<FaBalanceScale style={{ color: "#0284c7" }} />}
              title="GST Tax Composition"
              subtitle="Aggregated tax components"
            />

            <div className="card-body p-3 d-flex flex-column justify-content-between gap-3">
              {GST_COMPONENT_ITEMS.map((item) => {
                const numericVal = Number(totals?.[item.key] || 0) || 0;
                const sharePercent =
                  outputTaxTotal > 0 ? (numericVal / outputTaxTotal) * 100 : 0;
                const progressWidth = clampPercent(sharePercent).toFixed(1);

                return (
                  <div
                    key={item.key}
                    className="p-3 rounded-3 border transition-all"
                    style={{
                      backgroundColor: item.bgTint,
                      borderColor: item.borderColor,
                    }}
                  >
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <div className="d-flex align-items-center gap-2">
                        <span
                          className="badge rounded-1 text-white fw-bold shadow-sm"
                          style={{
                            backgroundColor: item.color,
                            fontSize: "0.75rem",
                            padding: "5px 9px",
                          }}
                        >
                          {item.label}
                        </span>

                        <span
                          className="fw-bold font-monospace"
                          style={{ fontSize: "0.8rem", color: "#374151" }}
                        >
                          {sharePercent.toFixed(1)}%
                        </span>
                      </div>

                      <div className="text-end">
                        <span
                          className="fw-bold font-monospace fs-6"
                          style={{ color: "#111827" }}
                        >
                          {formatINR(numericVal)}
                        </span>
                      </div>
                    </div>

                    <div
                      className="progress rounded-pill"
                      style={{
                        height: "6px",
                        backgroundColor: "rgba(255, 255, 255, 0.7)",
                      }}
                    >
                      <div
                        className="progress-bar rounded-pill"
                        role="progressbar"
                        style={{
                          width: `${progressWidth}%`,
                          backgroundColor: item.color,
                        }}
                        aria-valuenow={Number(progressWidth)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${item.label} share of output tax`}
                      />
                    </div>
                  </div>
                );
              })}

              <DarkSummaryBar
                label="Total Output Tax"
                valueClass="fs-5"
                value={formatINR(outputTaxTotal)}
              />
            </div>
          </div>
        </div>

        {/* PAYMENT & ITC PANEL */}
        <div className="col-12 col-xl-6">
          <div className="card border-0 shadow-sm rounded-4 h-100 bg-white overflow-hidden">
            <PanelHeader
              icon={<FaMoneyBillWave className="text-primary" />}
              title="Payment & ITC"
              subtitle="Tax utilization indicators"
            />

            <div className="card-body p-3.5 d-flex flex-column justify-content-between gap-3">
              <div className="d-flex flex-column gap-2.5">
                {PAYMENT_ITEMS.map((item) => (
                  <div
                    key={item.key}
                    className="p-3 rounded-3 border d-flex align-items-center justify-content-between transition-all"
                    style={{
                      backgroundColor: item.bgColor,
                      borderColor: item.borderColor,
                    }}
                  >
                    <div className="d-flex align-items-center gap-3">
                      <div
                        className={`rounded-3 d-flex align-items-center justify-content-center shadow-xs ${item.badgeBg}`}
                        style={{ width: 36, height: 36 }}
                      >
                        {item.icon}
                      </div>
                      <span
                        className="text-uppercase fw-extrabold text-secondary"
                        style={{
                          fontSize: "0.725rem",
                          letterSpacing: "0.6px",
                        }}
                      >
                        {item.label}
                      </span>
                    </div>

                    <strong
                      className={`fw-bold font-monospace fs-5 ${item.valueColor}`}
                    >
                      {formatINR(Number(safeNumber(totals[item.key])) || 0)}
                    </strong>
                  </div>
                ))}
              </div>

              <div className="row g-2.5">
                {RATIO_ITEMS.map((ratio) => {
                  const ratioValue = Number(safeNumber(totals[ratio.key])) || 0;
                  const calculatedRatio =
                    outputTaxTotal > 0 ? ratioValue / outputTaxTotal : 0;
                  const percentFormatted =
                    outputTaxTotal > 0
                      ? formatPercentage(calculatedRatio)
                      : "0.00%";
                  const progressWidth = clampPercent(
                    calculatedRatio * 100,
                  ).toFixed(1);

                  return (
                    <div className="col-6" key={ratio.key}>
                      <div
                        className="p-3 rounded-3 border h-100 d-flex flex-column justify-content-between"
                        style={{
                          backgroundColor: ratio.cardBg,
                          borderColor: ratio.borderColor,
                        }}
                      >
                        <div>
                          <div className="d-flex align-items-center justify-content-between mb-1.5">
                            <span
                              className="text-uppercase fw-bold text-dark text-truncate"
                              style={{
                                fontSize: "0.65rem",
                                letterSpacing: "0.5px",
                              }}
                            >
                              {ratio.label}
                            </span>
                          </div>
                          <div className="fw-bolder text-dark font-monospace fs-4 mb-2">
                            {percentFormatted}
                          </div>
                        </div>

                        <div>
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <span
                              className="text-muted fw-semibold"
                              style={{ fontSize: "0.625rem" }}
                            >
                              Utilization
                            </span>
                            <span
                              className="fw-bold text-dark font-monospace"
                              style={{ fontSize: "0.625rem" }}
                            >
                              {progressWidth}%
                            </span>
                          </div>
                          <div
                            className="progress rounded-pill bg-white border"
                            style={{
                              height: "7px",
                              borderColor: ratio.borderColor,
                            }}
                          >
                            <div
                              className={`progress-bar rounded-pill ${ratio.progressBg}`}
                              role="progressbar"
                              style={{ width: `${progressWidth}%` }}
                              aria-valuenow={Number(progressWidth)}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={ratio.label}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MONTHLY TAX MOVEMENT */}
      <div className="card officer-monthly-card">
        <div className="card-body p-0">
          <PanelHeader
            icon={<FaChartLine />}
            title="Monthly Tax Movement"
            subtitle="Output tax, ITC claimed and cash payment"
          />

          {history.length === 0 ? (
            <div className="officer-history-empty">
              <EmptyState message="No monthly tax movement available." />
            </div>
          ) : (
            <>
              <div className="officer-monthly-chart-wrapper">
                <div className="officer-monthly-chart">
                  {history.map((item, index) => (
                    <MonthColumn
                      key={item.retPeriod || index}
                      item={item}
                      maxValue={maxValue}
                    />
                  ))}
                </div>
              </div>

              <div className="officer-monthly-legend">
                <span className="officer-legend-item">
                  <span className="officer-legend-dot officer-legend-output" />
                  <span>Output Tax</span>
                </span>

                <span className="officer-legend-item">
                  <span className="officer-legend-dot officer-legend-itc" />
                  <span>ITC Claimed</span>
                </span>

                <span className="officer-legend-item">
                  <span className="officer-legend-dot officer-legend-cash" />
                  <span>Cash Paid</span>
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

/* ============================================================
 * ALERTS
 * ============================================================ */

const AlertItem = memo(function AlertItem({ alert }) {
  const severity = getSeverityClass(alert?.severity);
  const style = ALERT_STYLES[severity] || ALERT_STYLES.low;

  return (
    <div className={`border rounded-3 p-3 ${style.wrapper}`}>
      <div className="d-flex align-items-start gap-2">
        <div
          className={`rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 ${style.icon}`}
          style={{ width: 32, height: 32 }}
        >
          {severity === "critical" || severity === "high" ? (
            <FaExclamationTriangle size={13} />
          ) : (
            <FaExclamationCircle size={13} />
          )}
        </div>

        <div className="flex-grow-1 min-width-0">
          <div className="d-flex justify-content-between align-items-start gap-2">
            <strong className="text-dark" style={{ fontSize: "0.9rem" }}>
              {displayText(alert?.message, "Compliance alert")}
            </strong>

            <span className={`badge rounded-pill flex-shrink-0 ${style.badge}`}>
              {displayText(alert?.severity, "LOW")}
            </span>
          </div>

          <div className="d-flex flex-wrap gap-2 mt-2 text-muted small">
            <span>GSTIN: {displayText(alert?.gstin)}</span>

            <span>Period: {displayText(alert?.retPeriod)}</span>

            {alert?.formattedDate && <span>Date: {alert.formattedDate}</span>}

            {safeNumber(alert?.excessItc) > 0 && (
              <span className="text-danger fw-semibold">
                Excess ITC: {formatINR(alert.excessItc)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

/**
 * `onViewAll` is optional: the "View All" button is only rendered when a
 * handler is supplied. `maxItems` limits the preview (Infinity = show all).
 */
const AlertsPanel = memo(function AlertsPanel({
  alerts,
  onViewAll,
  maxItems = ALERTS_PREVIEW_LIMIT,
}) {
  return (
    <div className="card border-0 shadow-sm rounded-3 mb-3">
      <div className="card-body p-0">
        <PanelHeader
          icon={<FaExclamationTriangle />}
          title="Compliance Alerts"
          subtitle="Active anomaly and compliance warnings"
          action={
            alerts.length > 0 && onViewAll ? (
              <button
                type="button"
                className="btn btn-sm btn-link text-decoration-none fw-semibold"
                onClick={onViewAll}
              >
                View All
              </button>
            ) : null
          }
        />

        {alerts.length === 0 ? (
          <div className="p-3">
            <div className="d-flex align-items-center gap-3 bg-success-subtle rounded-3 p-3">
              <div
                className="bg-success text-white rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: 36, height: 36 }}
              >
                <FaCheckCircle />
              </div>

              <div>
                <strong className="d-block text-success">
                  No active compliance alerts
                </strong>

                <span className="small text-muted">
                  No high-risk anomaly has been reported for this GSTIN.
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3">
            <div className="d-flex flex-column gap-2">
              {alerts.slice(0, maxItems).map((alert, index) => (
                <AlertItem
                  alert={alert}
                  key={alert.id || `${alert.gstin}-${alert.retPeriod}-${index}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

/* ============================================================
 * RISK GAUGE
 * ============================================================ */

const GAUGE_RADIUS = 54;
const GAUGE_CIRCUMFERENCE = Math.PI * GAUGE_RADIUS;

const RiskGauge = memo(function RiskGauge({ score, category }) {
  const clamped = Math.min(Math.max(safeNumber(score), 0), 10);
  const offset = GAUGE_CIRCUMFERENCE * (1 - clamped / 10);
  const color = RISK_COLOR[getRiskClass(category)] || RISK_COLOR.low;

  return (
    <svg
      viewBox="0 0 140 80"
      width="140"
      height="80"
      role="img"
      aria-label={`Risk score ${clamped.toFixed(1)} out of 10`}
    >
      <path
        d="M 10 74 A 54 54 0 0 1 130 74"
        fill="none"
        stroke="#E2E5EA"
        strokeWidth="10"
        strokeLinecap="round"
      />

      <path
        d="M 10 74 A 54 54 0 0 1 130 74"
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={GAUGE_CIRCUMFERENCE}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.4s ease" }}
      />

      <text
        x="70"
        y="62"
        textAnchor="middle"
        fontFamily="IBM Plex Mono, monospace"
        fontSize="22"
        fill="#101A2B"
      >
        {clamped.toFixed(1)}
      </text>

      <text
        x="70"
        y="76"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
        fontSize="9"
        fill="#8B93A3"
      >
        RISK SCORE / 10
      </text>
    </svg>
  );
});

/* ============================================================
 * RISK SECTION
 * ============================================================ */

const getThemeConfig = (type) => {
  switch (type) {
    case "critical":
    case "high":
      return {
        badgeBg: "#fde8e8",
        badgeText: "#9b1c1c",
        badgeBorder: "#f8b4b4",
        border: "border-danger",
        text: "text-danger",
        glow: "rgba(224, 36, 36, 0.08)",
      };
    case "medium":
      return {
        badgeBg: "#fef3c7",
        badgeText: "#92400e",
        badgeBorder: "#fde68a",
        border: "border-warning",
        text: "text-warning-emphasis",
        glow: "rgba(217, 119, 6, 0.08)",
      };
    default:
      return {
        badgeBg: "#def7ec",
        badgeText: "#03543f",
        badgeBorder: "#84e1bc",
        border: "border-success",
        text: "text-success",
        glow: "rgba(14, 159, 110, 0.08)",
      };
  }
};

const RiskSection = memo(function RiskSection({
  analysis,
  alerts,
  delayedReturns,
}) {
  const riskClass = getRiskClass(analysis.riskCategory);
  const returnsCount = Array.isArray(analysis.last6MonthsHistory)
    ? analysis.last6MonthsHistory.length
    : 0;

  const riskTheme = getThemeConfig(riskClass);
  const delayTheme =
    delayedReturns > 0 ? getThemeConfig("high") : getThemeConfig("low");

  return (
    <div>
      <div className="row g-3 mb-4">
        {/* Risk Assessment Gauge Card */}
        <div className="col-12 col-lg-7">
          <div
            className={`card border-0 shadow-sm rounded-4 h-100 border-start border-4 ${riskTheme.border} position-relative overflow-hidden`}
            style={{
              background: `linear-gradient(135deg, #ffffff 55%, ${riskTheme.glow} 100%)`,
            }}
          >
            <div className="card-body p-3.5 d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-3">
                <RiskGauge
                  score={analysis.currentRiskScore}
                  category={analysis.riskCategory}
                />

                <div className="d-flex flex-column justify-content-center">
                  <span
                    className="fw-bold text-uppercase mb-1"
                    style={{
                      fontSize: "0.7rem",
                      letterSpacing: "0.6px",
                      color: "#4b5563",
                    }}
                  >
                    Risk Level Status
                  </span>

                  <div className="d-flex align-items-center gap-2 mb-1">
                    <strong
                      className={`fs-3 fw-bolder lh-1 ${riskTheme.text}`}
                      style={{ letterSpacing: "-0.3px" }}
                    >
                      {displayText(analysis.riskCategory, "LOW")}
                    </strong>
                    <span
                      className="badge rounded-pill fw-bold border px-2.5 py-1"
                      style={{
                        fontSize: "0.65rem",
                        backgroundColor: riskTheme.badgeBg,
                        color: riskTheme.badgeText,
                        borderColor: riskTheme.badgeBorder,
                      }}
                    >
                      Active
                    </span>
                  </div>

                  <div
                    className="d-flex align-items-center gap-1.5"
                    style={{ fontSize: "0.82rem" }}
                  >
                    <span className="fw-bold" style={{ color: "#111827" }}>
                      {safeNumber(analysis.currentRiskScore).toFixed(2)}
                    </span>
                    <span className="fw-medium" style={{ color: "#6b7280" }}>
                      / 10.00 Overall Score
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Delayed Returns Metric Card */}
        <div className="col-12 col-lg-5">
          <div
            className="card border-0 shadow-sm rounded-4 h-100 position-relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, #ffffff 55%, ${delayTheme.glow} 100%)`,
            }}
          >
            <div className="card-body p-3.5 d-flex flex-column justify-content-between">
              <div className="d-flex align-items-center justify-content-between">
                <span
                  className="fw-bold text-uppercase"
                  style={{
                    fontSize: "0.7rem",
                    letterSpacing: "0.6px",
                    color: "#4b5563",
                  }}
                >
                  Compliance Window
                </span>
                <span
                  className="badge rounded-pill fw-bold border px-2.5 py-1"
                  style={{
                    fontSize: "0.65rem",
                    backgroundColor: delayTheme.badgeBg,
                    color: delayTheme.badgeText,
                    borderColor: delayTheme.badgeBorder,
                  }}
                >
                  {delayedReturns > 0 ? "Action Needed" : "On Track"}
                </span>
              </div>

              <div className="d-flex align-items-baseline gap-2 mt-2">
                <strong
                  className={`display-6 font-monospace fw-bolder lh-1 ${delayTheme.text}`}
                >
                  {delayedReturns}
                </strong>
                <span
                  className="fw-bold"
                  style={{ fontSize: "0.88rem", color: "#1f2937" }}
                >
                  Delayed Returns
                </span>
              </div>

              <div
                className="pt-2 mt-2 border-top d-flex align-items-center justify-content-between"
                style={{ fontSize: "0.78rem", borderColor: "#e5e7eb" }}
              >
                <span className="fw-medium" style={{ color: "#6b7280" }}>
                  Analysis Window
                </span>
                <span
                  className="fw-bold font-monospace"
                  style={{ color: "#111827" }}
                >
                  {returnsCount} Months
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* This tab is the "View All" destination, so list every alert. */}
      <AlertsPanel alerts={alerts} maxItems={Infinity} />
    </div>
  );
});

/* ============================================================
 * PREDICTION SECTION
 * ============================================================ */

const PredictionRow = memo(function PredictionRow({ label, value }) {
  return (
    <div className="d-flex justify-content-between align-items-start gap-3 border-bottom py-2">
      <span className="text-muted small">{label}</span>

      <strong className="text-end" style={{ fontSize: "0.88rem" }}>
        {displayText(value)}
      </strong>
    </div>
  );
});

const PredictionSection = memo(function PredictionSection({
  prediction,
  loading,
  error,
  onRetry,
}) {
  if (loading) {
    return (
      <div className="card border-0 shadow-sm rounded-3">
        <div className="card-body py-5 text-center">
          <div
            className="bg-primary-subtle text-primary rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3"
            style={{ width: 52, height: 52 }}
          >
            <FaSpinner className="spin" size={22} />
          </div>

          <h5 className="fw-bold">Running AI Prediction</h5>

          <p className="text-muted small mb-0" role="status">
            XGBoost prediction engine is calculating projected liability and
            risk indicators.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card border-0 shadow-sm rounded-3" role="alert">
        <div className="card-body p-4">
          <div className="d-flex align-items-start gap-3 text-danger">
            <div
              className="bg-danger-subtle rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              style={{ width: 42, height: 42 }}
            >
              <FaExclamationCircle />
            </div>

            <div>
              <strong>Prediction unavailable</strong>

              <p className="text-muted small my-2">{error}</p>

              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={onRetry}
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!prediction) {
    return (
      <div className="card border-0 shadow-sm rounded-3">
        <EmptyState message="No prediction data available." />
      </div>
    );
  }

  const riskClass = getRiskClass(prediction.riskTrend);

  return (
    <div>
      {/* PREDICTION HEADER */}
      <div className="card border-0 shadow-sm rounded-3 mb-3">
        <div className="card-body p-3">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
            <div>
              <div className="officer-label">AI Prediction</div>

              <h5 className="fw-bold mb-1 mt-1">
                {prediction.targetRetPeriod}
              </h5>

              <small className="text-muted">
                Model: {displayText(prediction.modelVersion)} • Source:{" "}
                {displayText(prediction.predictionSource)}
              </small>
            </div>

            <div
              className={`d-flex align-items-center gap-2 px-3 py-2 rounded-3 ${
                riskClass === "critical" || riskClass === "high"
                  ? "bg-danger-subtle text-danger"
                  : riskClass === "medium"
                    ? "bg-warning-subtle text-warning-emphasis"
                    : "bg-success-subtle text-success"
              }`}
            >
              <FaShieldAlt />

              <strong>{displayText(prediction.riskTrend, "LOW")}</strong>

              <span className="font-monospace">
                Score {safeNumber(prediction.forecastedRiskScore).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* PREDICTION KPI */}
      <div className="row g-2 g-sm-3 mb-3">
        <div className="col-12 col-sm-6 col-xl-3">
          <KpiCard
            title="Predicted Output Tax"
            value={formatINRCompact(prediction.predictedOutputTax)}
            detail={formatINR(prediction.predictedOutputTax)}
            icon={<FaFileInvoiceDollar />}
            accent="primary"
          />
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <KpiCard
            title="Predicted ITC Available"
            value={formatINRCompact(prediction.predictedItcAvail)}
            detail={formatINR(prediction.predictedItcAvail)}
            icon={<FaBalanceScale />}
            accent="purple"
          />
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <KpiCard
            title="Predicted ITC Ratio"
            value={formatPercentage(prediction.predictedItcRatio)}
            detail="ITC / projected output tax"
            icon={<FaPercentage />}
            accent="success"
          />
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <KpiCard
            title="Expected Delay"
            value={`${safeNumber(prediction.delayDays)} days`}
            detail={prediction.estimatedFilingDate || "Filing date unavailable"}
            icon={<FaClock />}
            accent="primary"
          />
        </div>
      </div>

      {/* PREDICTION DETAILS */}
      <div className="row g-3">
        <div className="col-12 col-xl-6">
          <div className="card border-0 shadow-sm rounded-3 h-100">
            <div className="card-body p-3">
              <PanelHeader
                icon={<FaShieldAlt />}
                title="Prediction Risk Factors"
                subtitle="AI-generated compliance indicators"
              />

              <PredictionRow
                label="Probability of Default"
                value={formatPercentage(prediction.probabilityOfDefault)}
              />

              <PredictionRow
                label="Risk Category"
                value={prediction.riskTrend}
              />

              <PredictionRow
                label="Primary Risk Factor"
                value={prediction.primaryRiskFactor}
              />

              <PredictionRow
                label="Default Prediction"
                value={prediction.defaultPredicted ? "YES" : "NO"}
              />
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-6">
          <div className="card border-0 shadow-sm rounded-3 h-100">
            <div className="card-body p-3">
              <PanelHeader
                icon={<FaClock />}
                title="Filing Projection"
                subtitle="Expected filing timeline"
              />

              <PredictionRow label="Due Date" value={prediction.dueDate} />

              <PredictionRow
                label="Estimated Filing Date"
                value={prediction.estimatedFilingDate}
              />

              <PredictionRow
                label="Expected Delay"
                value={`${safeNumber(prediction.delayDays)} days`}
              />

              <PredictionRow
                label="Calculated Late Fee"
                value={formatINR(prediction.calculatedLateFee)}
              />
            </div>
          </div>
        </div>
      </div>

      {prediction.nilReturn && (
        <div className="alert alert-success border-0 shadow-sm rounded-3 mt-3 d-flex align-items-center gap-2">
          <FaCheckCircle />

          <div>
            <strong className="d-block">Nil Return Prediction</strong>

            <small>
              The AI model predicts no taxable output and no available ITC for
              the projected return period.
            </small>
          </div>
        </div>
      )}
    </div>
  );
});

/* ============================================================
 * PANEL HEADER
 * ============================================================ */

const PanelHeader = memo(function PanelHeader({
  icon,
  title,
  subtitle,
  action,
}) {
  return (
    <div className="d-flex align-items-center justify-content-between gap-2 p-3 border-bottom">
      <div className="d-flex align-items-center gap-2">
        <div
          className="bg-primary-subtle text-primary rounded-2 d-flex align-items-center justify-content-center flex-shrink-0"
          style={{ width: 34, height: 34 }}
        >
          {React.cloneElement(icon, { size: 14 })}
        </div>

        <div>
          <h6 className="mb-0 fw-bold text-dark">{title}</h6>

          {subtitle && <small className="text-muted">{subtitle}</small>}
        </div>
      </div>

      {action}
    </div>
  );
});

/* ============================================================
 * TAB BUTTON
 * ============================================================ */

const TabButton = memo(function TabButton({
  id,
  label,
  Icon,
  active,
  onSelect,
}) {
  const handleClick = useCallback(() => onSelect(id), [onSelect, id]);

  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={active}
      aria-controls={active ? `panel-${id}` : undefined}
      tabIndex={active ? 0 : -1}
      className={`btn btn-sm officer-tab rounded-2 d-flex align-items-center gap-1 px-3 ${
        active ? "btn-primary shadow-sm" : "btn-light text-secondary"
      }`}
      onClick={handleClick}
      style={{ fontSize: "0.8rem", minHeight: 34, fontWeight: 600 }}
    >
      <Icon size={12} />

      <span>{label}</span>
    </button>
  );
});

/* ============================================================
 * EMPTY STATE
 * ============================================================ */

const EmptyState = memo(function EmptyState({ message }) {
  return (
    <div className="p-4 text-center">
      <div
        className="bg-light text-secondary rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2"
        style={{ width: 42, height: 42 }}
      >
        <FaHistory />
      </div>

      <span className="text-muted small">{message}</span>
    </div>
  );
});

/* ============================================================
 * ERROR BOUNDARY
 *
 * A rendering error in one section must not blank the whole page.
 * ============================================================ */

class TaxpayerViewErrorBoundary extends React.Component {
  constructor(props) {
    super(props);

    this.state = { hasError: false };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error(
      "TaxpayerView crashed:",
      error,
      info?.componentStack || "",
    );
  }

  handleReset() {
    this.setState({ hasError: false });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="px-2 px-sm-3 px-lg-4 py-4">
          <div className="alert alert-danger shadow-sm" role="alert">
            <strong className="d-block mb-1">
              This page could not be displayed.
            </strong>
            <span className="small d-block mb-3">
              An unexpected error occurred while rendering the GSTIN analysis.
            </span>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={this.handleReset}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const TaxpayerViewWithBoundary = (props) => (
  <TaxpayerViewErrorBoundary>
    <TaxpayerView {...props} />
  </TaxpayerViewErrorBoundary>
);

export default TaxpayerViewWithBoundary;
