import React, {
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
  FaGlobeAmericas,
  FaCoins,
} from "react-icons/fa";

import {
  fetchGstinAnalysis,
  fetchPrediction,
} from "../../services/predictionService";

import "./GstAnalysisOfficer.css";

/* ============================================================
 * CONSTANTS
 * ============================================================ */

const GSTIN_LENGTH = 15;
const PREDICTION_MONTHS = 3;

const RISK_COLOR = {
  low: "#0E7C46",
  medium: "#B45309",
  high: "#C0362C",
  critical: "#7A2418",
};
/* ============================================================
 * HELPERS
 * ============================================================ */

const safeNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const displayText = (value, fallback = "N/A") => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  return String(value);
};

const normalizeGstin = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

const isValidGstin = (value) => {
  const gstin = normalizeGstin(value);

  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(
    gstin
  );
};

const formatINR = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeNumber(value));

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

const formatPercentage = (value) =>
  `${(safeNumber(value) * 100).toFixed(2)}%`;

const formatReturnPeriod = (period) => {
  if (!period) {
    return "N/A";
  }

  const value = String(period);

  if (/^\d{6}$/.test(value)) {
    const month = Number(value.substring(0, 2));
    const year = value.substring(2);

    const months = [
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

    if (month >= 1 && month <= 12) {
      return `${months[month - 1]} ${year}`;
    }
  }

  return value;
};

const getRiskClass = (risk) => {
  const value = String(risk || "LOW")
    .trim()
    .toUpperCase();

  if (
    value.includes("CRITICAL") ||
    value.includes("VERY_HIGH")
  ) {
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

const getFilingClass = (status) => {
  const value = String(status || "FILED")
    .trim()
    .toUpperCase();

  if (value === "DELAYED") {
    return "delayed";
  }

  if (value === "PENDING") {
    return "pending";
  }

  return "filed";
};

const getDelayClass = (days) => {
  const value = safeNumber(days);

  if (value >= 30) {
    return "critical";
  }

  if (value >= 15) {
    return "high";
  }

  if (value > 0) {
    return "medium";
  }

  return "low";
};

/* ============================================================
 * MAIN COMPONENT
 * ============================================================ */

const GstinAnalysisPage = ({
  gstin: initialGstin = "",
  onBack,
}) => {
  const initialValue = normalizeGstin(initialGstin);

  const [gstinInput, setGstinInput] = useState(initialValue);
  const [selectedGstin, setSelectedGstin] = useState(initialValue);

  const [analysis, setAnalysis] = useState(null);
  const [prediction, setPrediction] = useState(null);

  const [loading, setLoading] = useState(false);
  const [predictionLoading, setPredictionLoading] = useState(false);

  const [error, setError] = useState("");
  const [predictionError, setPredictionError] = useState("");
  const [inputError, setInputError] = useState("");

  const [activeTab, setActiveTab] = useState("overview");

  const analysisControllerRef = useRef(null);

  const isBusy = loading || predictionLoading;

  /* ============================================================
   * GSTIN INPUT
   * ============================================================ */

  const handleGstinChange = useCallback((event) => {
    const value = normalizeGstin(event.target.value);

    setGstinInput(value.substring(0, GSTIN_LENGTH));

    if (inputError) {
      setInputError("");
    }
  }, [inputError]);

  /* ============================================================
   * LOAD ANALYSIS
   * ============================================================ */

  const loadAnalysis = useCallback(
    async (gstinValue, signal) => {
      const cleanGstin = normalizeGstin(gstinValue);

      if (!cleanGstin) {
        setAnalysis(null);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const result = await fetchGstinAnalysis(
          cleanGstin,
          signal
        );

        if (signal?.aborted) {
          return;
        }

        setAnalysis(result || null);
      } catch (err) {
        if (
          err?.name === "CanceledError" ||
          err?.name === "AbortError" ||
          signal?.aborted
        ) {
          return;
        }

        setError(
          err?.response?.data?.message ||
          err?.message ||
          "Unable to load GSTIN analysis."
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    []
  );

  /* ============================================================
   * LOAD PREDICTION
   * ============================================================ */

  const loadPrediction = useCallback(async (gstinValue) => {
    const cleanGstin = normalizeGstin(gstinValue);

    if (!cleanGstin) {
      return;
    }

    setPredictionLoading(true);
    setPredictionError("");

    try {
      const result = await fetchPrediction(
        cleanGstin,
        PREDICTION_MONTHS
      );

      setPrediction(result || null);
    } catch (err) {
      setPredictionError(
        err?.response?.data?.message ||
        err?.message ||
        "Unable to load prediction."
      );
    } finally {
      setPredictionLoading(false);
    }
  }, []);

  /* ============================================================
   * ANALYZE GSTIN
   * ============================================================ */

  const handleAnalyze = useCallback(
    (event) => {
      event?.preventDefault();

      const cleanGstin = normalizeGstin(gstinInput);

      if (!cleanGstin) {
        setInputError("Please enter a GSTIN.");
        return;
      }

      if (!isValidGstin(cleanGstin)) {
        setInputError(
          "Please enter a valid 15-character GSTIN."
        );
        return;
      }

      setInputError("");
      setSelectedGstin(cleanGstin);

      setAnalysis(null);
      setPrediction(null);

      setError("");
      setPredictionError("");

      setActiveTab("overview");

      if (analysisControllerRef.current) {
        analysisControllerRef.current.abort();
      }

      const controller = new AbortController();

      analysisControllerRef.current = controller;

      loadAnalysis(
        cleanGstin,
        controller.signal
      );

      loadPrediction(cleanGstin);
    },
    [
      gstinInput,
      loadAnalysis,
      loadPrediction,
    ]
  );

  /* ============================================================
   * INITIAL GSTIN
   * ============================================================ */

  useEffect(() => {
    const initial = normalizeGstin(initialGstin);

    if (!initial || !isValidGstin(initial)) {
      return undefined;
    }

    setGstinInput(initial);
    setSelectedGstin(initial);

    if (analysisControllerRef.current) {
      analysisControllerRef.current.abort();
    }

    const controller = new AbortController();

    analysisControllerRef.current = controller;

    loadAnalysis(
      initial,
      controller.signal
    );

    loadPrediction(initial);

    return () => {
      controller.abort();
    };
  }, [
    initialGstin,
    loadAnalysis,
    loadPrediction,
  ]);

  /* ============================================================
   * CLEANUP
   * ============================================================ */

  useEffect(() => {
    return () => {
      if (analysisControllerRef.current) {
        analysisControllerRef.current.abort();
      }
    };
  }, []);

  /* ============================================================
   * REFRESH
   * ============================================================ */

  const handleRefresh = useCallback(() => {
    if (!selectedGstin || isBusy) {
      return;
    }

    if (analysisControllerRef.current) {
      analysisControllerRef.current.abort();
    }

    const controller = new AbortController();

    analysisControllerRef.current = controller;

    loadAnalysis(
      selectedGstin,
      controller.signal
    );

    loadPrediction(selectedGstin);
  }, [
    selectedGstin,
    isBusy,
    loadAnalysis,
    loadPrediction,
  ]);

  /* ============================================================
   * HISTORY
   * ============================================================ */

  const history = useMemo(() => {
    if (
      !Array.isArray(
        analysis?.last6MonthsHistory
      )
    ) {
      return [];
    }

    return [
      ...analysis.last6MonthsHistory,
    ].sort((a, b) => {
      const periodA = String(
        a?.retPeriod || ""
      );

      const periodB = String(
        b?.retPeriod || ""
      );

      const keyA =
        periodA.length === 6
          ? periodA.substring(2) +
          periodA.substring(0, 2)
          : periodA;

      const keyB =
        periodB.length === 6
          ? periodB.substring(2) +
          periodB.substring(0, 2)
          : periodB;

      return keyB.localeCompare(keyA);
    });
  }, [analysis]);

  /* ============================================================
   * TOTALS
   * ============================================================ */

  const totals = useMemo(() => {
    const fields = [
      "taxableValue",
      "igst",
      "cgst",
      "sgst",
      "cess",
      "outputTax",
      "itcClaimed",
      "cashPaid",
      "rcmTax",
    ];

    const result = {};

    fields.forEach((field) => {
      result[field] = history.reduce(
        (sum, item) =>
          sum + safeNumber(item?.[field]),
        0
      );
    });

    return {
      taxableValue: result.taxableValue,
      igst: result.igst,
      cgst: result.cgst,
      sgst: result.sgst,
      cess: result.cess,
      outputTax: result.outputTax,
      itc: result.itcClaimed,
      cash: result.cashPaid,
      rcm: result.rcmTax,
    };
  }, [history]);

  /* ============================================================
   * COMPLIANCE METRICS
   * ============================================================ */

  const averageCashRatio = useMemo(() => {
    if (!history.length) {
      return 0;
    }

    return (
      history.reduce(
        (sum, item) =>
          sum + safeNumber(item?.cashRatio),
        0
      ) / history.length
    );
  }, [history]);

  const averageItcRatio = useMemo(() => {
    if (!history.length) {
      return 0;
    }

    return (
      history.reduce(
        (sum, item) =>
          sum + safeNumber(item?.itcRatio),
        0
      ) / history.length
    );
  }, [history]);

  const delayedReturns = useMemo(
    () =>
      history.filter(
        (item) =>
          String(
            item?.filingStatus || ""
          ).toUpperCase() === "DELAYED" ||
          safeNumber(
            item?.filingDelayDays
          ) > 0
      ).length,
    [history]
  );

  const totalDelayDays = useMemo(
    () =>
      history.reduce(
        (sum, item) =>
          sum +
          safeNumber(
            item?.filingDelayDays
          ),
        0
      ),
    [history]
  );

  const alerts = Array.isArray(
    analysis?.activeAlerts
  )
    ? analysis.activeAlerts
    : [];

  const riskClass = getRiskClass(
    analysis?.riskCategory
  );

  /* ============================================================
   * HEADER
   * ============================================================ */

  const searchSection = (
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
              <h5 className="fw-bold text-dark mb-0 text-truncate mt-1" style={{ fontSize: "1.05rem", letterSpacing: "-0.2px" }}>
                GSTR-3B Return Compliance &amp; AI Risk Assessment
              </h5>
            </div>
          </div>

          {/* CONTROLS & ACTIONS */}
          <div className="d-flex flex-wrap align-items-center justify-content-xl-end gap-2.5 flex-grow-1">
            <form
              onSubmit={handleAnalyze}
              noValidate
              className="d-flex align-items-center flex-grow-1"
              style={{ maxWidth: "520px" }}
            >
              <div
                className={`input-group rounded-3 transition-all flex-grow-1 ${inputError
                  ? "border border-danger shadow-sm"
                  : "border shadow-xs"
                  }`}
                style={{
                  backgroundColor: "#f8fafc",
                }}
              >
                <span className="input-group-text bg-transparent border-0 py-1.5 ps-3 pe-2">
                  <FaSearch size={14} className="text-secondary" />
                </span>

                <input
                  id="gstin-analysis-input"
                  type="text"
                  value={gstinInput}
                  onChange={handleGstinChange}
                  placeholder="Enter 15-character GSTIN (e.g., 27AAAAA0000A1Z5)"
                  maxLength={GSTIN_LENGTH}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="GSTIN"
                  aria-invalid={Boolean(inputError)}
                  className="form-control bg-transparent border-0 py-1.5 px-2 shadow-none"
                  style={{
                    height: "38px",
                    fontSize: "0.88rem",
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontWeight: 600,
                    letterSpacing: "0.6px",
                    textTransform: "uppercase",
                  }}
                />

                <span className="input-group-text bg-transparent border-0 py-1.5 pe-3 ps-1">
                  <span
                    className={`badge rounded-pill fw-semibold ${gstinInput.length === GSTIN_LENGTH
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
                disabled={isBusy || !gstinInput}
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
            {analysis && (
              <button
                type="button"
                className="btn btn-light border rounded-3 d-flex align-items-center justify-content-center gap-1.5 shadow-xs px-3 text-secondary fw-medium"
                style={{
                  fontSize: "0.85rem",
                  height: "38px",
                  backgroundColor: "#ffffff",
                }}
                disabled={isBusy}
                onClick={handleRefresh}
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
                style={{
                  height: "38px",
                  fontSize: "0.85rem",
                }}
                onClick={onBack}
              >
                ← Back
              </button>
            )}
          </div>
        </div>

        {/* INPUT ERROR ALERT */}
        {inputError && (
          <div className="mt-2 text-danger d-flex align-items-center gap-1.5 ps-1">
            <FaExclamationCircle size={13} />
            <span style={{ fontSize: "0.78rem", fontWeight: 500 }}>
              {inputError}
            </span>
          </div>
        )}
      </div>
    </header>
  );

  /* ============================================================
   * NO ANALYSIS
   * ============================================================ */

  if (!analysis && !loading) {
    return (
      <div className="gst-analysis-page">

        {searchSection}

        {error && (
          <div className="px-2 px-sm-3 px-lg-4">
            <div className="card border-0 shadow-sm rounded-3">
              <div className="card-body p-4">
                <div className="d-flex align-items-start gap-3 text-danger">

                  <div
                    className="bg-danger-subtle rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                    style={{
                      width: 42,
                      height: 42,
                    }}
                  >
                    <FaExclamationCircle />
                  </div>

                  <div>
                    <h6 className="fw-bold mb-1">
                      Unable to Load GSTIN Analysis
                    </h6>

                    <p className="text-muted mb-3 small">
                      {error}
                    </p>

                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={
                        handleRefresh
                      }
                    >
                      <FaSyncAlt className="me-1" />
                      Retry
                    </button>
                  </div>

                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  /* ============================================================
   * LOADING
   * ============================================================ */

  if (loading && !analysis) {
    return (
      <div className="gst-analysis-page">

        {searchSection}

        <div className="px-2 px-sm-3 px-lg-4">
          <div className="card border-0 shadow-sm rounded-3">
            <div className="card-body py-5 text-center">

              <div
                className="bg-primary-subtle text-primary rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3"
                style={{
                  width: 52,
                  height: 52,
                }}
              >
                <FaSpinner
                  className="spin"
                  size={22}
                />
              </div>

              <h5 className="fw-bold text-dark mb-1">
                Loading GSTIN Analysis
              </h5>

              <p className="text-muted small mb-0">
                Fetching GSTR-3B history,
                tax profile and compliance
                information...
              </p>

            </div>
          </div>
        </div>

      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="gst-analysis-page">
        {searchSection}
      </div>
    );
  }

  /* ============================================================
   * MAIN DASHBOARD
   * ============================================================ */

  return (
    <div className="gst-analysis-page">

      {searchSection}

      {/* ======================================================
* TAXPAYER PROFILE
* ====================================================== */}
      <div className="px-2 px-sm-3 px-lg-4">
        <div className="card border-0 shadow-sm rounded-3 mb-4 overflow-hidden">
          <div className="card-body p-0">
            <div className="row g-0">

              {/* 1. GSTIN (Navy / Primary Theme) */}
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
                        className={`badge rounded-2 fw-semibold px-2 py-1 d-inline-flex align-items-center gap-1 ${String(analysis.status || "ACTIVE").toUpperCase() === "ACTIVE"
                          ? "bg-success text-white"
                          : "bg-warning text-dark"
                          }`}
                        style={{ fontSize: "0.72rem" }}
                      >
                        <FaCheckCircle size={10} />
                        {displayText(analysis.status, "ACTIVE")}
                      </span>
                      <span className="text-muted small fw-medium" style={{ fontSize: "0.72rem" }}>
                        Status
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. TAXPAYER (Secondary / Slate Theme) */}
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

              {/* 3. JURISDICTION (Light / Neutral Theme) */}
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

              {/* 4. METRICS / RETURNS LOGGED (Dark Slate Theme) */}
              <div className="col-12 col-sm-6 col-xl-3 p-3 p-md-4 bg-dark bg-opacity-10 border-end border-bottom border-sm-bottom-0">
                <div className="d-flex align-items-center gap-3 h-100">
                  <div
                    className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0 bg-dark text-white shadow-sm"
                    style={{ width: 42, height: 42 }}
                  >
                    <span className="fw-bold font-monospace" style={{ fontSize: "0.85rem" }}>
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
                        {history.length}
                      </span>
                      <span className="text-muted fw-medium" style={{ fontSize: "0.78rem" }}>
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

      {/* ======================================================
 * TABS (Modern Enterprise UI)
 * ====================================================== */}

      <div className="px-2 px-sm-3 px-lg-4">
        <div className="card border-0 shadow-sm rounded-3 mb-4 bg-light">
          <div
            className="d-flex flex-wrap align-items-center gap-2 p-2"
            role="tablist"
            aria-label="GSTIN analysis sections"
          >
            <TabButton
              active={activeTab === "overview"}
              onClick={() => setActiveTab("overview")}
              icon={<FaChartLine />}
              label="Overview"
            />

            <TabButton
              active={activeTab === "history"}
              onClick={() => setActiveTab("history")}
              icon={<FaTable />}
              label="GSTR-3B History"
            />

            <TabButton
              active={activeTab === "tax"}
              onClick={() => setActiveTab("tax")}
              icon={<FaFileInvoiceDollar />}
              label="Tax Breakdown"
            />

            <TabButton
              active={activeTab === "risk"}
              onClick={() => setActiveTab("risk")}
              icon={<FaShieldAlt />}
              label="Risk & Alerts"
            />

            <TabButton
              active={activeTab === "prediction"}
              onClick={() => setActiveTab("prediction")}
              icon={<FaChartLine />}
              label="AI Prediction"
            />
          </div>
        </div>
      </div>

      {/* ======================================================
       * TAB CONTENT
       * ====================================================== */}

      <div className="px-2 px-sm-3 px-lg-4 pb-4">

        {activeTab === "overview" && (
          <>
            <div className="row g-3 mb-3">
              {/* =====================================================
    TAX SUMMARY PANEL
===================================================== */}
              <div className="col-12 col-xl-6">
                <BootstrapPanel
                  icon={<FaFileInvoiceDollar className="text-primary" />}
                  title="Tax Summary"
                  subtitle="Aggregated GSTR-3B values"
                >
                  <div className="row g-2">
                    {/* TAXABLE VALUE */}
                    <div className="col-6 col-md-4">
                      <div className="p-3 rounded-3 bg-primary bg-opacity-10 border border-primary-subtle h-100">
                        <div
                          className="text-uppercase fw-bold text-muted mb-1"
                          style={{ fontSize: "0.68rem", letterSpacing: "0.5px" }}
                        >
                          Taxable Value
                        </div>
                        <div className="fw-bold text-dark font-monospace fs-6">
                          {formatINRCompact(totals.taxableValue)}
                        </div>
                      </div>
                    </div>

                    {/* OUTPUT TAX */}
                    <div className="col-6 col-md-4">
                      <div className="p-3 rounded-3 bg-secondary bg-opacity-10 border border-secondary-subtle h-100">
                        <div
                          className="text-uppercase fw-bold text-muted mb-1"
                          style={{ fontSize: "0.68rem", letterSpacing: "0.5px" }}
                        >
                          Output Tax
                        </div>
                        <div className="fw-bold text-dark font-monospace fs-6">
                          {formatINRCompact(totals.outputTax)}
                        </div>
                      </div>
                    </div>

                    {/* ITC CLAIMED */}
                    <div className="col-6 col-md-4">
                      <div className="p-3 rounded-3 bg-info bg-opacity-10 border border-info-subtle h-100">
                        <div
                          className="text-uppercase fw-bold text-muted mb-1"
                          style={{ fontSize: "0.68rem", letterSpacing: "0.5px" }}
                        >
                          ITC Claimed
                        </div>
                        <div className="fw-bold text-dark font-monospace fs-6">
                          {formatINRCompact(totals.itc)}
                        </div>
                      </div>
                    </div>

                    {/* CASH PAID */}
                    <div className="col-6 col-md-4">
                      <div className="p-3 rounded-3 bg-success bg-opacity-10 border border-success-subtle h-100">
                        <div
                          className="text-uppercase fw-bold text-muted mb-1"
                          style={{ fontSize: "0.68rem", letterSpacing: "0.5px" }}
                        >
                          Cash Paid
                        </div>
                        <div className="fw-bold text-dark font-monospace fs-6">
                          {formatINRCompact(totals.cash)}
                        </div>
                      </div>
                    </div>

                    {/* RCM TAX */}
                    <div className="col-6 col-md-4">
                      <div className="p-3 rounded-3 bg-dark bg-opacity-10 border border-dark-subtle h-100">
                        <div
                          className="text-uppercase fw-bold text-muted mb-1"
                          style={{ fontSize: "0.68rem", letterSpacing: "0.5px" }}
                        >
                          RCM Tax
                        </div>
                        <div className="fw-bold text-dark font-monospace fs-6">
                          {formatINRCompact(totals.rcm)}
                        </div>
                      </div>
                    </div>

                    {/* DELAYED RETURNS */}
                    <div className="col-6 col-md-4">
                      <div
                        className={`p-3 rounded-3 border h-100 ${delayedReturns > 0
                          ? "bg-warning bg-opacity-25 border-warning-subtle"
                          : "bg-success bg-opacity-10 border-success-subtle"
                          }`}
                      >
                        <div
                          className="text-uppercase fw-bold text-muted mb-1"
                          style={{ fontSize: "0.68rem", letterSpacing: "0.5px" }}
                        >
                          Delayed Returns
                        </div>
                        <div
                          className={`fw-bold font-monospace fs-6 ${delayedReturns > 0 ? "text-warning-emphasis" : "text-success"
                            }`}
                        >
                          {delayedReturns}
                        </div>
                      </div>
                    </div>
                  </div>
                </BootstrapPanel>
              </div>
              {/* =====================================================
    COMPLIANCE INDICATORS PANEL
===================================================== */}
              <div className="col-12 col-xl-6">
                <BootstrapPanel
                  icon={<FaPercentage className="text-primary" />}
                  title="Compliance Indicators"
                  subtitle="Calculated from analysed returns"
                >
                  <div className="d-flex flex-column gap-2.5">

                    {/* RATIO CARDS RENDERER */}
                    {[
                      {
                        label: "Average ITC Ratio",
                        value: averageItcRatio,
                        theme: "info",
                      },
                      {
                        label: "Average Cash Payment Ratio",
                        value: averageCashRatio,
                        theme: "success",
                      },
                    ].map(({ label, value, theme }) => {
                      const percent = (Number(value) || 0) * 100;
                      const formatted = percent.toFixed(2);
                      const progressWidth = Math.min(Math.max(percent, 0), 100).toFixed(2);

                      return (
                        <div
                          key={label}
                          className={`p-3 rounded-3 bg-${theme}-subtle border border-${theme}-subtle`}
                        >
                          <div className="d-flex align-items-center justify-content-between mb-1.5">
                            <span
                              className="text-uppercase fw-bold text-secondary"
                              style={{ fontSize: "0.68rem", letterSpacing: "0.5px" }}
                            >
                              {label}
                            </span>
                            <span className="fw-bold text-dark font-monospace fs-6">
                              {formatted}%
                            </span>
                          </div>
                          <div className="progress" style={{ height: "6px" }}>
                            <div
                              className={`progress-bar bg-${theme}`}
                              role="progressbar"
                              style={{ width: `${progressWidth}%` }}
                              aria-valuenow={formatted}
                              aria-valuemin="0"
                              aria-valuemax="100"
                            />
                          </div>
                        </div>
                      );
                    })}

                  </div>
                </BootstrapPanel>
              </div>
            </div>

            {/* SUB-COMPONENTS */}
            <TaxComponentCards totals={totals} />
            <RecentHistory history={history} onViewAll={() => setActiveTab("history")} />
            <AlertsPanel alerts={alerts} onViewAll={() => setActiveTab("risk")} />
          </>
        )}

        {activeTab === "history" && (
          <HistoryTable
            history={history}
          />
        )}

        {activeTab === "tax" && (
          <TaxBreakdown
            history={history}
            totals={totals}
          />
        )}

        {activeTab === "risk" && (
          <RiskSection
            analysis={analysis}
            alerts={alerts}
            delayedReturns={
              delayedReturns
            }
            totalDelayDays={
              totalDelayDays
            }
          />
        )}

        {activeTab ===
          "prediction" && (
            <PredictionSection
              prediction={
                prediction
              }
              loading={
                predictionLoading
              }
              error={
                predictionError
              }
              onRetry={() =>
                loadPrediction(
                  selectedGstin
                )
              }
            />
          )}

      </div>

    </div>
  );
};

/* ============================================================
 * HEADER RISK BADGE
 * ============================================================ */

const RiskHeaderBadge = ({
  category,
  score,
}) => {
  const riskClass =
    getRiskClass(category);

  const classes = {
    critical:
      "border-danger bg-danger-subtle text-danger",
    high:
      "border-danger bg-danger-subtle text-danger",
    medium:
      "border-warning bg-warning-subtle text-warning-emphasis",
    low:
      "border-success bg-success-subtle text-success",
  };

  return (
    <div
      className={`d-flex align-items-center gap-1 px-2 rounded-2 border ${classes[riskClass]}`}
      style={{
        height: "32px",
        fontSize: "0.78rem",
      }}
    >
      <FaShieldAlt size={11} />

      <span className="fw-semibold">
        Risk
      </span>

      <strong className="font-monospace">
        {displayText(
          category,
          "LOW"
        )}
      </strong>

      <span className="font-monospace fw-bold">
        {safeNumber(score).toFixed(2)}
      </span>
    </div>
  );
};

/* ============================================================
 * PROFILE ITEM
 * ============================================================ */

const ProfileBootstrapItem = ({
  icon,
  label,
  value,
  subValue,
}) => (
  <div className="d-flex align-items-center gap-2">

    <div
      className="bg-light text-secondary rounded-2 d-flex align-items-center justify-content-center flex-shrink-0"
      style={{
        width: 34,
        height: 34,
      }}
    >
      {React.cloneElement(
        icon,
        { size: 14 }
      )}
    </div>

    <div
      className="min-width-0"
      style={{ minWidth: 0 }}
    >

      <div className="officer-label">
        {label}
      </div>

      <div
        className="text-dark fw-semibold text-truncate"
        style={{
          fontSize: "0.88rem",
        }}
        title={displayText(
          value
        )}
      >
        {displayText(value)}
      </div>

      {subValue && (
        <small
          className="text-muted text-truncate d-block"
          title={subValue}
        >
          {subValue}
        </small>
      )}

    </div>

  </div>
);

/* ============================================================
 * PROFILE STAT
 * ============================================================ */

const ProfileStat = ({
  label,
  value,
  subValue,
  valueClass = "text-dark",
}) => (
  <div className="text-center">

    <div className="officer-label">
      {label}
    </div>

    <div
      className={`fw-bold font-monospace mt-1 ${valueClass}`}
      style={{ fontSize: "1.1rem" }}
    >
      {value}
    </div>

    <small
      className="text-muted text-nowrap"
    >
      {subValue}
    </small>

  </div>
);

/* ============================================================
 * KPI CARD
 * ============================================================ */

const KpiCard = ({
  title,
  value,
  detail,
  icon,
  accent,
}) => {
  const accentMap = {
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
    purple: {
      border: "",
      text: "",
      bg: "",
    },
  };

  const config =
    accentMap[accent] ||
    accentMap.primary;

  return (
    <div
      className={`card border-0 shadow-sm rounded-3 h-100 bg-white border-start border-4 ${config.border}`}
      style={
        accent === "purple"
          ? {
            borderLeftColor:
              "#6f42c1",
          }
          : undefined
      }
    >

      <div className="card-body p-3">

        <div className="d-flex align-items-center justify-content-between mb-2">

          <span className="officer-label">
            {title}
          </span>

          <div
            className={`p-2 rounded-circle ${accent === "purple"
              ? ""
              : config.bg
              }`}
            style={
              accent === "purple"
                ? {
                  backgroundColor:
                    "#f3ebf9",
                  color:
                    "#6f42c1",
                }
                : undefined
            }
          >
            {React.cloneElement(
              icon,
              { size: 15 }
            )}
          </div>

        </div>

        <h4
          className={`fw-bold mb-1 font-monospace text-truncate ${accent === "purple"
            ? ""
            : config.text
            }`}
          style={
            accent === "purple"
              ? {
                color:
                  "#6f42c1",
              }
              : undefined
          }
          title={value}
        >
          {value}
        </h4>

        <span className="text-muted small">
          {detail}
        </span>

      </div>

    </div>
  );
};

/* ============================================================
 * RISK KPI
 * ============================================================ */

const RiskKpiCard = ({
  score,
  category,
}) => {
  const riskClass =
    getRiskClass(category);

  const riskConfig = {
    critical: {
      border:
        "border-danger",
      text: "text-danger",
      badge:
        "bg-danger-subtle text-danger",
    },

    high: {
      border:
        "border-danger",
      text: "text-danger",
      badge:
        "bg-danger-subtle text-danger",
    },

    medium: {
      border:
        "border-warning",
      text:
        "text-warning-emphasis",
      badge:
        "bg-warning-subtle text-warning-emphasis",
    },

    low: {
      border:
        "border-success",
      text: "text-success",
      badge:
        "bg-success-subtle text-success",
    },
  };

  const config =
    riskConfig[riskClass] ||
    riskConfig.low;

  return (
    <div
      className={`card border-0 shadow-sm rounded-3 h-100 border-start border-4 ${config.border}`}
    >

      <div className="card-body p-3">

        <div className="d-flex align-items-center justify-content-between mb-2">

          <span className="officer-label">
            Current Risk Score
          </span>

          <span
            className={`badge rounded-pill font-monospace fw-bold ${config.badge}`}
          >
            {displayText(
              category,
              "LOW"
            )}
          </span>

        </div>

        <h4
          className={`fw-bold mb-1 font-monospace ${config.text}`}
        >
          {safeNumber(
            score
          ).toFixed(2)}

          <small
            className="text-muted ms-1"
          >
            / 10
          </small>
        </h4>

        <span className="text-muted small">
          AI compliance risk assessment
        </span>

      </div>

    </div>
  );
};

/* ============================================================
 * BOOTSTRAP PANEL
 * ============================================================ */

const BootstrapPanel = ({
  icon,
  title,
  subtitle,
  action,
  children,
  className = "",
}) => (
  <div
    className={`card border-0 shadow-sm rounded-3 h-100 ${className}`}
  >

    <div className="card-body p-3">

      <div className="d-flex align-items-center justify-content-between gap-2 mb-3">

        <div className="d-flex align-items-center gap-2">

          <div
            className="bg-primary-subtle text-primary rounded-2 d-flex align-items-center justify-content-center flex-shrink-0"
            style={{
              width: 34,
              height: 34,
            }}
          >
            {React.cloneElement(
              icon,
              { size: 14 }
            )}
          </div>

          <div>

            <h6 className="mb-0 fw-bold text-dark">
              {title}
            </h6>

            {subtitle && (
              <small className="text-muted">
                {subtitle}
              </small>
            )}

          </div>

        </div>

        {action}

      </div>

      {children}

    </div>

  </div>
);

/* ============================================================
 * SUMMARY ITEM
 * ============================================================ */

const SummaryBootstrapItem = ({
  label,
  value,
  valueClass = "text-dark",
}) => (
  <div className="col-6 col-md-4">

    <div className="bg-light rounded-2 p-2">

      <div className="officer-label">
        {label}
      </div>

      <div
        className={`fw-bold font-monospace mt-1 text-truncate ${valueClass}`}
        style={{
          fontSize: "0.9rem",
        }}
        title={String(value)}
      >
        {value}
      </div>

    </div>

  </div>
);

/* ============================================================
 * RATIO
 * ============================================================ */

const RatioBootstrapRow = ({
  label,
  value,
}) => {
  const percentage =
    safeNumber(value) * 100;

  const width = Math.min(
    Math.max(percentage, 0),
    100
  );

  return (
    <div className="mb-3">

      <div className="d-flex justify-content-between align-items-center mb-1">

        <span className="small text-muted">
          {label}
        </span>

        <strong
          className="font-monospace"
          style={{
            fontSize: "0.86rem",
          }}
        >
          {formatPercentage(value)}
        </strong>

      </div>

      <div
        className="progress"
        style={{
          height: "6px",
        }}
      >
        <div
          className="progress-bar bg-primary"
          role="progressbar"
          style={{
            width: `${width}%`,
          }}
          aria-valuenow={
            percentage
          }
          aria-valuemin="0"
          aria-valuemax="100"
        />
      </div>

    </div>
  );
};

/* ============================================================
 * TAX COMPONENT CARDS (HIGH-CONTRAST & DYNAMIC HEX STYLING)
 * ============================================================ */

const TaxComponentCards = ({ totals = {}, formatINR, formatINRCompact }) => {
  // Configured with exact requested hex values and dynamic background tints
  const taxConfig = [
    {
      label: "IGST",
      value: totals.igst || 0,
      color: "#6f42c1",
      bgTint: "#f3e8ff",
      borderColor: "#d8b4fe",
      icon: <FaGlobeAmericas size={14} />,
    },
    {
      label: "CGST",
      value: totals.cgst || 0,
      color: "#0d9488",
      bgTint: "#ccfbf1",
      borderColor: "#99f6e4",
      icon: <FaBuilding size={14} />,
    },
    {
      label: "SGST",
      value: totals.sgst || 0,
      color: "#0284c7",
      bgTint: "#e0f2fe",
      borderColor: "#bae6fd",
      icon: <FaLandmark size={14} />,
    },
    {
      label: "CESS",
      value: totals.cess || 0,
      color: "#fd7e14",
      bgTint: "#ffedd5",
      borderColor: "#fed7aa",
      icon: <FaCoins size={14} />,
    },
  ];

  // Calculate total combined tax to compute share percentages
  const grandTotal = taxConfig.reduce(
    (acc, curr) => acc + (Number(curr.value) || 0),
    0
  );

  return (
    <div className="row g-2 g-sm-3 mb-3">
      {taxConfig.map((item) => {
        const numericVal = Number(item.value) || 0;
        const sharePercent =
          grandTotal > 0 ? (numericVal / grandTotal) * 100 : 0;

        const formattedCompact =
          typeof formatINRCompact === "function"
            ? formatINRCompact(numericVal)
            : `₹${numericVal.toLocaleString("en-IN")}`;

        const formattedFull =
          typeof formatINR === "function"
            ? formatINR(numericVal)
            : `₹${numericVal.toLocaleString("en-IN")}`;

        return (
          <div className="col-6 col-lg-3" key={item.label}>
            <div
              className="card border-0 shadow-sm rounded-4 h-100 position-relative overflow-hidden"
              style={{
                backgroundColor: item.bgTint,
                border: `1px solid ${item.borderColor}`,
              }}
            >
              <div className="card-body p-3.5 d-flex flex-column justify-content-between">

                {/* Header: Label & Icon Badge */}
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span
                    className="fw-bold text-uppercase"
                    style={{
                      fontSize: "0.72rem",
                      letterSpacing: "0.6px",
                      color: "#374151",
                    }}
                  >
                    {item.label}
                  </span>

                  {/* Icon Badge using specific hex color */}
                  <div
                    className="rounded-3 d-flex align-items-center justify-content-center shadow-sm text-white"
                    style={{
                      width: 32,
                      height: 32,
                      backgroundColor: item.color,
                    }}
                  >
                    {item.icon}
                  </div>
                </div>

                {/* Body: Main Value Display */}
                <div className="my-1">
                  <div
                    className="fw-bolder font-monospace lh-1"
                    style={{ fontSize: "1.35rem", color: "#111827" }}
                  >
                    {formattedCompact}
                  </div>
                  <small
                    className="fw-bold d-block text-truncate mt-1.5"
                    style={{ fontSize: "0.75rem", color: "#4b5563" }}
                    title={formattedFull}
                  >
                    {formattedFull}
                  </small>
                </div>

                {/* Footer: Share Bar & Percentage */}
                <div className="mt-2">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span
                      className="fw-semibold"
                      style={{ fontSize: "0.68rem", color: "#4b5563" }}
                    >
                      Share
                    </span>
                    <span
                      className="fw-bold font-monospace"
                      style={{ fontSize: "0.72rem", color: "#111827" }}
                    >
                      {sharePercent.toFixed(1)}%
                    </span>
                  </div>

                  {/* Inline Progress Track */}
                  <div
                    className="progress rounded-pill"
                    style={{
                      height: "5px",
                      backgroundColor: "rgba(255, 255, 255, 0.7)",
                    }}
                  >
                    <div
                      className="progress-bar rounded-pill transition-all"
                      role="progressbar"
                      style={{
                        width: `${Math.min(Math.max(sharePercent, 0), 100)}%`,
                        backgroundColor: item.color,
                      }}
                      aria-valuenow={sharePercent}
                      aria-valuemin="0"
                      aria-valuemax="100"
                    />
                  </div>
                </div>

              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
/* ============================================================
 * RECENT HISTORY
 * ============================================================ */

const RecentHistory = ({
  history,
  onViewAll,
}) => {
  const rows = Array.isArray(history)
    ? history.slice(0, 3)
    : [];

  return (
    <div className="card officer-history-card mb-3">

      <div className="card-body p-0">

        {/* ====================================================
            PANEL HEADER
            ==================================================== */}

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

        {/* ====================================================
            TABLE / EMPTY STATE
            ==================================================== */}

        {rows.length === 0 ? (
          <div className="officer-history-empty">
            <EmptyState
              message="No GSTR-3B history available."
            />
          </div>
        ) : (
          <div className="table-responsive officer-history-table-wrapper">

            <table
              className="table table-hover align-middle mb-0 officer-history-table"
              style={{ fontSize: "14px" }}
            >
              {/* ==================================================
      TABLE HEADER
      ================================================== */}
              <thead
                className="table-dark text-uppercase border-bottom"
                style={{ fontSize: "0.75rem", letterSpacing: "0.5px" }}
              >
                <tr>
                  <th className="py-3 px-3 border-0 officer-period-column">Period</th>
                  <th className="py-3 px-2 border-0 text-end">Taxable Value</th>
                  <th className="py-3 px-2 border-0 text-end">Output Tax</th>
                  <th className="py-3 px-2 border-0 text-end">ITC Claimed</th>
                  <th className="py-3 px-2 border-0 text-end">Cash Paid</th>
                  <th className="py-3 px-2 border-0 text-center">Filing Delay</th>
                  <th className="py-3 px-2 border-0 text-center">Filing Status</th>
                </tr>
              </thead>

              {/* ==================================================
      TABLE BODY
      ================================================== */}
              <tbody>
                {rows.map((item, index) => {
                  const delayDays = safeNumber(item.filingDelayDays);
                  const filingStatus = item.filingStatus || "FILED";

                  return (
                    <tr key={item.retPeriod || index}>
                      {/* PERIOD */}
                      <td className="px-3 py-2 fw-bold officer-period-cell" style={{ color: "#212529" }}>
                        <span className="d-block officer-period-value" style={{ fontSize: "14px" }}>
                          {item.formattedPeriod || formatReturnPeriod(item.retPeriod)}
                        </span>
                        <small className="d-block text-muted" style={{ fontSize: "12px" }}>
                          {item.retPeriod}
                        </small>
                      </td>

                      {/* TAXABLE VALUE */}
                      <td
                        className="px-2 text-end font-monospace text-nowrap"
                        style={{ color: "#0d6efd", fontWeight: 600, fontSize: "14px" }}
                      >
                        {formatINR(item.taxableValue)}
                      </td>

                      {/* OUTPUT TAX */}
                      <td
                        className="px-2 text-end font-monospace text-nowrap"
                        style={{ color: "#3730a3", fontSize: "14px" }}
                      >
                        {formatINR(item.outputTax)}
                      </td>

                      {/* ITC CLAIMED */}
                      <td
                        className="px-2 text-end font-monospace text-nowrap"
                        style={{ color: "#198754", fontSize: "14px" }}
                      >
                        {formatINR(item.itcClaimed)}
                      </td>

                      {/* CASH PAID */}
                      <td
                        className="px-2 text-end font-monospace text-nowrap"
                        style={{ color: "#059669", fontSize: "14px" }}
                      >
                        {formatINR(item.cashPaid)}
                      </td>

                      {/* FILING DELAY */}
                      <td className="text-center fw-bold" style={{ fontSize: "14px" }}>
                        <span
                          className={`officer-delay-badge fw-bold ${getDelayBadgeClass(
                            item.filingDelayDays
                          )}`}
                          style={{ fontSize: "13px" }}
                        >
                          {delayDays > 0 && <span className="officer-delay-dot" />}
                          {delayDays} {delayDays === 1 ? "day" : "days"}
                        </span>
                      </td>

                      {/* FILING STATUS */}
                      <td className="text-center fw-bold" style={{ fontSize: "14px" }}>
                        <span
                          className={`officer-filing-badge fw-bold ${getFilingBadgeClass(
                            filingStatus
                          )}`}
                          style={{ fontSize: "13px" }}
                        >
                          {filingStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

          </div>
        )}

      </div>
    </div>
  );
};

/* ============================================================
 * HISTORY TABLE
 * ============================================================ */

const HistoryTable = ({
  history,
}) => (
  <div className="card officer-history-card mb-3">

    <div className="card-body p-0">

      <PanelHeader
        icon={<FaTable />}
        title="GSTR-3B Return History"
        subtitle="Complete analysed return history"
      />

      {history.length === 0 ? (
        <div className="officer-history-empty">
          <EmptyState
            message="No GSTR-3B return history found."
          />
        </div>
      ) : (
        <div className="table-responsive officer-complete-history-wrapper">

          <table
            className="table table-hover align-middle mb-0 officer-complete-history"
            style={{ fontSize: "14px" }}
          >
            {/* ==================================================
      HEADER
      ================================================== */}
            <thead
              className="table-dark text-uppercase border-bottom"
              style={{ fontSize: "0.75rem", letterSpacing: "0.5px" }}
            >
              <tr>
                <th className="py-3 px-3 border-0">Period</th>
                <th className="py-3 px-2 border-0 text-end">Taxable Value</th>
                <th className="py-3 px-2 border-0 text-end">IGST</th>
                <th className="py-3 px-2 border-0 text-end">CGST</th>
                <th className="py-3 px-2 border-0 text-end">SGST</th>
                <th className="py-3 px-2 border-0 text-end">CESS</th>
                <th className="py-3 px-2 border-0 text-end">Output Tax</th>
                <th className="py-3 px-2 border-0 text-end">ITC Claimed</th>
                <th className="py-3 px-2 border-0 text-end">Cash Paid</th>
                <th className="py-3 px-2 border-0 text-end">RCM Tax</th>
                <th className="py-3 px-2 border-0 text-end">ITC Ratio</th>
                <th className="py-3 px-2 border-0 text-end">Cash Ratio</th>
                <th className="py-3 px-2 border-0 text-center">Delay</th>
                <th className="py-3 px-2 border-0 text-center">Status</th>
              </tr>
            </thead>

            {/* ==================================================
      BODY
      ================================================== */}
            <tbody>
              {history.map((item, index) => {
                const delayDays = safeNumber(item.filingDelayDays);
                const filingStatus = item.filingStatus || "FILED";

                return (
                  <tr key={item.retPeriod || index}>
                    {/* RETURN PERIOD */}
                    <td className="px-3 py-2 fw-bold" style={{ color: "#212529" }}>
                      <span className="d-block" style={{ fontSize: "14px" }}>
                        {item.formattedPeriod || formatReturnPeriod(item.retPeriod)}
                      </span>
                      <small className="d-block text-muted" style={{ fontSize: "12px" }}>
                        {item.retPeriod}
                      </small>
                    </td>

                    {/* TAXABLE VALUE */}
                    <td
                      className="px-2 text-end font-monospace text-nowrap"
                      style={{ color: "#0d6efd", fontWeight: 600, fontSize: "14px" }}
                    >
                      {formatINR(item.taxableValue ?? item.taxValue ?? item.taxvalues)}
                    </td>

                    {/* IGST */}
                    <td
                      className="px-2 text-end font-monospace fw-bold text-nowrap"
                      style={{ color: "#6f42c1", fontSize: "14px" }}
                    >
                      {formatINR(item.igst)}
                    </td>

                    {/* CGST */}
                    <td
                      className="px-2 text-end font-monospace fw-bold text-nowrap"
                      style={{ color: "#0d9488", fontSize: "14px" }}
                    >
                      {formatINR(item.cgst)}
                    </td>

                    {/* SGST */}
                    <td
                      className="px-2 text-end font-monospace fw-bold text-nowrap"
                      style={{ color: "#0284c7", fontSize: "14px" }}
                    >
                      {formatINR(item.sgst)}
                    </td>

                    {/* CESS */}
                    <td
                      className="px-2 text-end font-monospace fw-bold text-nowrap"
                      style={{ color: "#fd7e14", fontSize: "14px" }}
                    >
                      {formatINR(item.cess)}
                    </td>

                    {/* OUTPUT TAX */}
                    <td
                      className="px-2 text-end font-monospace fw-bold text-nowrap"
                      style={{ color: "#3730a3", fontSize: "14px" }}
                    >
                      {formatINR(item.outputTax)}
                    </td>

                    {/* ITC CLAIMED */}
                    <td
                      className="px-2 text-end font-monospace fw-bold text-nowrap"
                      style={{ color: "#198754", fontSize: "14px" }}
                    >
                      {formatINR(item.itcClaimed)}
                    </td>

                    {/* CASH PAID */}
                    <td
                      className="px-2 text-end font-monospace fw-bold text-nowrap"
                      style={{ color: "#059669", fontSize: "14px" }}
                    >
                      {formatINR(item.cashPaid)}
                    </td>

                    {/* RCM TAX */}
                    <td
                      className="px-2 text-end font-monospace fw-bold text-nowrap"
                      style={{ color: "#d63384", fontSize: "14px" }}
                    >
                      {formatINR(item.rcmTax)}
                    </td>

                    {/* ITC RATIO */}
                    <td
                      className="px-2 text-end font-monospace fw-bold text-nowrap"
                      style={{ color: "#0891b2", fontSize: "14px" }}
                    >
                      {formatPercentage(item.itcRatio)}
                    </td>

                    {/* CASH RATIO */}
                    <td
                      className="px-2 text-end font-monospace fw-bold text-nowrap"
                      style={{ color: "#475569", fontSize: "14px" }}
                    >
                      {formatPercentage(item.cashRatio)}
                    </td>

                    {/* DELAY */}
                    <td className="text-center fw-bold" style={{ fontSize: "14px" }}>
                      <span
                        className={`officer-delay-badge fw-bold ${getDelayBadgeClass(
                          item.filingDelayDays
                        )}`}
                        style={{ fontSize: "13px" }}
                      >
                        {delayDays > 0 && <span className="officer-delay-dot" />}
                        {delayDays} {delayDays === 1 ? "day" : "days"}
                      </span>
                    </td>

                    {/* STATUS */}
                    <td className="text-center fw-bold" style={{ fontSize: "14px" }}>
                      <span
                        className={`officer-filing-badge fw-bold ${getFilingBadgeClass(
                          filingStatus
                        )}`}
                        style={{ fontSize: "13px" }}
                      >
                        {filingStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

        </div>
      )}

    </div>
  </div>
);


/* ============================================================
 * TAX BREAKDOWN
 * ============================================================ */

const TaxBreakdown = ({ history = [], totals = {} }) => {
  const safeOutputTax = safeNumber(totals.outputTax);
  const safeItc = safeNumber(totals.itc);
  const safeCash = safeNumber(totals.cash);
  const safeRcm = safeNumber(totals.rcm);

  return (
    <div className="gst-tax-breakdown">

      <div className="row g-3 mb-3">

        {/* =========================================================
 * GST TAX COMPOSITION PANEL (MATCHED HEX COLOR THEME)
 * ========================================================= */}
        <div className="col-12 col-xl-6">
          <div className="card border shadow-sm rounded-3 h-100 bg-white">

            {/* Panel Header */}
            <PanelHeader
              icon={<FaBalanceScale style={{ color: "#0284c7" }} />}
              title="GST Tax Composition"
              subtitle="Aggregated tax components"
            />

            <div className="card-body p-3 d-flex flex-column justify-content-between gap-3">

              {/* DYNAMIC TAX BREAKDOWN ROWS WITH EXACT HEX COLORS */}
              {[
                {
                  label: "IGST",
                  value: totals?.igst || 0,
                  color: "#6f42c1",
                  bgTint: "#f3e8ff",
                  borderColor: "#d8b4fe",
                },
                {
                  label: "CGST",
                  value: totals?.cgst || 0,
                  color: "#0d9488",
                  bgTint: "#ccfbf1",
                  borderColor: "#99f6e4",
                },
                {
                  label: "SGST",
                  value: totals?.sgst || 0,
                  color: "#0284c7",
                  bgTint: "#e0f2fe",
                  borderColor: "#bae6fd",
                },
                {
                  label: "CESS",
                  value: totals?.cess || 0,
                  color: "#fd7e14",
                  bgTint: "#ffedd5",
                  borderColor: "#fed7aa",
                },
              ].map((item) => {
                const numericVal = Number(item.value) || 0;
                const safeTotal = Number(safeOutputTax) || 0;
                const sharePercent = safeTotal > 0 ? (numericVal / safeTotal) * 100 : 0;
                const progressWidth = Math.min(Math.max(sharePercent, 0), 100).toFixed(1);

                return (
                  <div
                    key={item.label}
                    className="p-3 rounded-3 border transition-all"
                    style={{
                      backgroundColor: item.bgTint,
                      borderColor: item.borderColor,
                    }}
                  >
                    {/* Header: Label, Share, and Formatted Value */}
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <div className="d-flex align-items-center gap-2">

                        {/* Badge with exact theme background */}
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

                        {/* Share Percentage */}
                        <span
                          className="fw-bold font-monospace"
                          style={{ fontSize: "0.8rem", color: "#374151" }}
                        >
                          {sharePercent.toFixed(1)}%
                        </span>
                      </div>

                      {/* Primary Value Display */}
                      <div className="text-end">
                        <span
                          className="fw-bold font-monospace fs-6"
                          style={{ color: "#111827" }}
                        >
                          {formatINR(numericVal)}
                        </span>
                      </div>
                    </div>

                    {/* Custom Progress Bar matching component hex */}
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
                        aria-valuenow={progressWidth}
                        aria-valuemin="0"
                        aria-valuemax="100"
                      />
                    </div>
                  </div>
                );
              })}

              {/* TOTAL SUMMARY BLOCK */}
              <div
                className="p-3 rounded-3 text-white d-flex align-items-center justify-content-between shadow-sm"
                style={{ backgroundColor: "#1e293b" }}
              >
                <div className="d-flex align-items-center gap-2">
                  <span
                    className="rounded-circle d-inline-block"
                    style={{
                      width: "8px",
                      height: "8px",
                      backgroundColor: "#10b981",
                    }}
                  />
                  <span
                    className="text-uppercase fw-bold"
                    style={{
                      fontSize: "0.72rem",
                      letterSpacing: "0.5px",
                      color: "#94a3b8",
                    }}
                  >
                    Total Output Tax
                  </span>
                </div>

                <strong
                  className="font-monospace fs-5 fw-bold"
                  style={{ color: "#f8fafc" }}
                >
                  {formatINR(safeOutputTax || 0)}
                </strong>
              </div>

            </div>
          </div>
        </div>


        {/* =========================================================
 * PAYMENT & ITC PANEL (MODERN UI)
 * ========================================================= */}
        <div className="col-12 col-xl-6">
          <div className="card border-0 shadow-sm rounded-4 h-100 bg-white overflow-hidden">

            {/* Panel Header */}
            <PanelHeader
              icon={<FaMoneyBillWave className="text-primary" />}
              title="Payment & ITC"
              subtitle="Tax utilization indicators"
            />

            <div className="card-body p-3.5 d-flex flex-column justify-content-between gap-3">

              {/* 1. MAIN PAYMENT & CLAIM METRICS */}
              <div className="d-flex flex-column gap-2.5">
                {[
                  {
                    label: "ITC Claimed",
                    value: safeItc,
                    icon: <FaFileInvoiceDollar size={15} />,
                    badgeBg: "bg-primary text-white",
                    borderColor: "#bfdbfe",
                    bgColor: "#f0f9ff",
                    valueColor: "text-primary",
                  },
                  {
                    label: "Cash Paid",
                    value: safeCash,
                    icon: <FaMoneyBillWave size={15} />,
                    badgeBg: "bg-success text-white",
                    borderColor: "#bbf7d0",
                    bgColor: "#f0fdf4",
                    valueColor: "text-success",
                  },
                  {
                    label: "RCM Tax",
                    value: safeRcm,
                    icon: <FaExchangeAlt size={15} />,
                    badgeBg: "bg-warning text-dark",
                    borderColor: "#fde68a",
                    bgColor: "#fffbeb",
                    valueColor: "text-dark",
                  },
                ].map((item) => {
                  const numericVal = Number(item.value) || 0;

                  return (
                    <div
                      key={item.label}
                      className="p-3 rounded-3 border d-flex align-items-center justify-content-between transition-all"
                      style={{ backgroundColor: item.bgColor, borderColor: item.borderColor }}
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
                          style={{ fontSize: "0.725rem", letterSpacing: "0.6px" }}
                        >
                          {item.label}
                        </span>
                      </div>

                      <strong className={`fw-bold font-monospace fs-5 ${item.valueColor}`}>
                        {formatINR(numericVal)}
                      </strong>
                    </div>
                  );
                })}
              </div>

              {/* 2. RATIO UTILIZATION METRICS WITH HIGH-CONTRAST PROGRESS BARS */}
              <div className="row g-2.5">
                {[
                  {
                    label: "Cash / Output Tax",
                    value: safeCash,
                    progressBg: "bg-success",
                    cardBg: "#f0fdf4",
                    borderColor: "#bbf7d0",
                    badgeText: "bg-success-subtle text-success-emphasis",
                  },
                  {
                    label: "ITC / Output Tax",
                    value: safeItc,
                    progressBg: "bg-primary",
                    cardBg: "#f0f9ff",
                    borderColor: "#bfdbfe",
                    badgeText: "bg-primary-subtle text-primary-emphasis",
                  },
                ].map((ratio) => {
                  const outputTax = Number(safeOutputTax) || 0;
                  const ratioValue = Number(ratio.value) || 0;
                  const calculatedRatio = outputTax > 0 ? ratioValue / outputTax : 0;
                  const percentFormatted =
                    outputTax > 0
                      ? typeof formatPercentage === "function"
                        ? formatPercentage(calculatedRatio)
                        : `${(calculatedRatio * 100).toFixed(2)}%`
                      : "0.00%";

                  const progressWidth = Math.min(Math.max(calculatedRatio * 100, 0), 100).toFixed(1);

                  return (
                    <div className="col-6" key={ratio.label}>
                      <div
                        className="p-3 rounded-3 border h-100 d-flex flex-column justify-content-between"
                        style={{ backgroundColor: ratio.cardBg, borderColor: ratio.borderColor }}
                      >
                        <div>
                          <div className="d-flex align-items-center justify-content-between mb-1.5">
                            <span
                              className="text-uppercase fw-bold text-dark text-truncate"
                              style={{ fontSize: "0.65rem", letterSpacing: "0.5px" }}
                            >
                              {ratio.label}
                            </span>
                          </div>
                          <div className="fw-bolder text-dark font-monospace fs-4 mb-2">
                            {percentFormatted}
                          </div>
                        </div>

                        {/* Micro Progress Bar Container */}
                        <div>
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <span className="text-muted fw-semibold" style={{ fontSize: "0.625rem" }}>
                              Utilization
                            </span>
                            <span className="fw-bold text-dark font-monospace" style={{ fontSize: "0.625rem" }}>
                              {progressWidth}%
                            </span>
                          </div>
                          <div className="progress rounded-pill bg-white border" style={{ height: "7px", borderColor: ratio.borderColor }}>
                            <div
                              className={`progress-bar rounded-pill ${ratio.progressBg}`}
                              role="progressbar"
                              style={{ width: `${progressWidth}%` }}
                              aria-valuenow={progressWidth}
                              aria-valuemin="0"
                              aria-valuemax="100"
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
      {/* ============================================================
       * MONTHLY TAX MOVEMENT
       * ============================================================ */}

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
              {/* Chart */}
              <div className="officer-monthly-chart-wrapper">
                <div className="officer-monthly-chart">
                  {history.map((item, index) => {
                    const outputTax = safeNumber(
                      item.outputTax
                    );
                    const itcClaimed = safeNumber(
                      item.itcClaimed
                    );
                    const cashPaid = safeNumber(
                      item.cashPaid
                    );
                    const maxValue = Math.max(
                      ...history.map((row) =>
                        Math.max(
                          safeNumber(row.outputTax),
                          safeNumber(row.itcClaimed),
                          safeNumber(row.cashPaid)
                        )
                      ),
                      1
                    );

                    const outputHeight =
                      (outputTax / maxValue) * 100;

                    const itcHeight =
                      (itcClaimed / maxValue) * 100;

                    const cashHeight =
                      (cashPaid / maxValue) * 100;

                    return (

                      <div
                        className="officer-month-column"
                        key={item.retPeriod || index}
                      >

                        {/* Values */}

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


                        {/* Bars */}

                        <div className="officer-month-bars">

                          <div
                            className="officer-tax-bar officer-output-bar"
                            style={{
                              height: `${Math.max(
                                outputHeight,
                                outputTax > 0 ? 3 : 0
                              )}%`,
                            }}
                            title={`Output Tax: ${formatINR(outputTax)}`}
                          />

                          <div
                            className="officer-tax-bar officer-itc-bar"
                            style={{
                              height: `${Math.max(
                                itcHeight,
                                itcClaimed > 0 ? 3 : 0
                              )}%`,
                            }}
                            title={`ITC Claimed: ${formatINR(itcClaimed)}`}
                          />

                          <div
                            className="officer-tax-bar officer-cash-bar"
                            style={{
                              height: `${Math.max(
                                cashHeight,
                                cashPaid > 0 ? 3 : 0
                              )}%`,
                            }}
                            title={`Cash Paid: ${formatINR(cashPaid)}`}
                          />

                        </div>


                        {/* Period */}

                        <div className="officer-month-period">

                          {item.formattedPeriod ||
                            formatReturnPeriod(
                              item.retPeriod
                            )}

                        </div>

                      </div>

                    );
                  })}

                </div>

              </div>


              {/* Legend */}

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
};



/* ============================================================
 * TAX BREAKDOWN ROW
 * ============================================================ */

const TaxBreakdownRow = ({
  label,
  value,
  total,
}) => {
  const percentage =
    total > 0
      ? (value / total) * 100
      : 0;

  return (
    <div className="mb-3">

      <div className="d-flex justify-content-between align-items-center mb-1">

        <strong
          style={{
            fontSize: "0.88rem",
          }}
        >
          {label}
        </strong>

        <span
          className="font-monospace"
          style={{
            fontSize: "0.84rem",
          }}
        >
          {formatINR(value)}
        </span>

      </div>

      <div className="d-flex align-items-center gap-2">

        <div
          className="progress flex-grow-1"
          style={{
            height: 7,
          }}
        >
          <div
            className="progress-bar bg-primary"
            style={{
              width: `${Math.min(
                percentage,
                100
              )}%`,
            }}
          />
        </div>

        <strong
          className="font-monospace"
          style={{
            width: 56,
            textAlign:
              "right",
            fontSize:
              "0.78rem",
          }}
        >
          {percentage.toFixed(
            2
          )}
          %
        </strong>

      </div>

    </div>
  );
};

/* ============================================================
 * ALERTS
 * ============================================================ */

const AlertsPanel = ({
  alerts,
  onViewAll,
}) => (
  <div className="card border-0 shadow-sm rounded-3 mb-3">

    <div className="card-body p-0">

      <PanelHeader
        icon={
          <FaExclamationTriangle />
        }
        title="Compliance Alerts"
        subtitle="Active anomaly and compliance warnings"
        action={
          alerts.length > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-link text-decoration-none fw-semibold"
              onClick={onViewAll}
            >
              View All
            </button>
          )
        }
      />

      {alerts.length === 0 ? (
        <div className="p-3">

          <div className="d-flex align-items-center gap-3 bg-success-subtle rounded-3 p-3">

            <div
              className="bg-success text-white rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              style={{
                width: 36,
                height: 36,
              }}
            >
              <FaCheckCircle />
            </div>

            <div>

              <strong className="d-block text-success">
                No active compliance alerts
              </strong>

              <span className="small text-muted">
                No high-risk anomaly has
                been reported for this GSTIN.
              </span>

            </div>

          </div>

        </div>
      ) : (
        <div className="p-3">

          <div className="d-flex flex-column gap-2">

            {alerts
              .slice(0, 5)
              .map(
                (alert, index) => (
                  <AlertItem
                    alert={alert}
                    key={
                      alert.id ||
                      `${alert.gstin}-${alert.retPeriod}-${index}`
                    }
                  />
                )
              )}

          </div>

        </div>
      )}

    </div>

  </div>
);

/* ============================================================
 * ALERT ITEM
 * ============================================================ */

const AlertItem = ({
  alert,
}) => {
  const severity =
    getSeverityClass(
      alert?.severity
    );

  const config = {
    critical: {
      wrapper:
        "border-danger bg-danger-subtle",
      icon:
        "bg-danger text-white",
      badge:
        "bg-danger text-white",
    },

    high: {
      wrapper:
        "border-danger bg-danger-subtle",
      icon:
        "bg-danger text-white",
      badge:
        "bg-danger text-white",
    },

    medium: {
      wrapper:
        "border-warning bg-warning-subtle",
      icon:
        "bg-warning text-dark",
      badge:
        "bg-warning text-dark",
    },

    low: {
      wrapper:
        "border-secondary bg-light",
      icon:
        "bg-secondary text-white",
      badge:
        "bg-secondary text-white",
    },
  };

  const style =
    config[severity] ||
    config.low;

  return (
    <div
      className={`border rounded-3 p-3 ${style.wrapper}`}
    >

      <div className="d-flex align-items-start gap-2">

        <div
          className={`rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 ${style.icon}`}
          style={{
            width: 32,
            height: 32,
          }}
        >
          {severity ===
            "critical" ||
            severity ===
            "high" ? (
            <FaExclamationTriangle
              size={13}
            />
          ) : (
            <FaExclamationCircle
              size={13}
            />
          )}
        </div>

        <div className="flex-grow-1 min-width-0">

          <div className="d-flex justify-content-between align-items-start gap-2">

            <strong
              className="text-dark"
              style={{
                fontSize:
                  "0.9rem",
              }}
            >
              {displayText(
                alert?.message,
                "Compliance alert"
              )}
            </strong>

            <span
              className={`badge rounded-pill flex-shrink-0 ${style.badge}`}
            >
              {displayText(
                alert?.severity,
                "LOW"
              )}
            </span>

          </div>

          <div className="d-flex flex-wrap gap-2 mt-2 text-muted small">

            <span>
              GSTIN:{" "}
              {displayText(
                alert?.gstin
              )}
            </span>

            <span>
              Period:{" "}
              {displayText(
                alert?.retPeriod
              )}
            </span>

            {alert?.formattedDate && (
              <span>
                Date:{" "}
                {
                  alert.formattedDate
                }
              </span>
            )}

            {safeNumber(
              alert?.excessItc
            ) > 0 && (
                <span className="text-danger fw-semibold">
                  Excess ITC:{" "}
                  {formatINR(
                    alert.excessItc
                  )}
                </span>
              )}

          </div>

        </div>

      </div>

    </div>
  );
};

/* ============================================================
 * RISK GAUGE
 * ============================================================ */

const RiskGauge = ({
  score,
  category,
}) => {
  const clamped = Math.min(
    Math.max(
      safeNumber(score),
      0
    ),
    10
  );

  const pct = clamped / 10;

  const radius = 54;

  const circumference =
    Math.PI * radius;

  const offset =
    circumference *
    (1 - pct);

  const color =
    RISK_COLOR[
    getRiskClass(category)
    ] ||
    RISK_COLOR.low;

  return (
    <svg
      viewBox="0 0 140 80"
      width="140"
      height="80"
      role="img"
      aria-label={`Risk score ${clamped.toFixed(
        1
      )} out of 10`}
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
        strokeDasharray={
          circumference
        }
        strokeDashoffset={
          offset
        }
        style={{
          transition:
            "stroke-dashoffset 0.4s ease",
        }}
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
};

/* ============================================================
 * MODERN RISK SECTION (HIGH-CONTRAST TEXT & VISUAL CLARITY)
 * ============================================================ */

const RiskSection = ({ analysis, alerts, delayedReturns }) => {
  const riskClass = getRiskClass(analysis.riskCategory);
  const returnsCount = Array.isArray(analysis.last6MonthsHistory)
    ? analysis.last6MonthsHistory.length
    : 0;

  // High-Contrast Theme & Color Configuration
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
                  {/* High Contrast Header Label */}
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

                  {/* High Contrast Status Line */}
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

                  {/* Dark Clear Numeric Score */}
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
              {/* Card Header & Status Badge */}
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

              {/* Main Metric High-Contrast View */}
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

              {/* Table Baseline Summary */}
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

      <AlertsPanel alerts={alerts} onViewAll={() => { }} />
    </div>
  );
};
/* ============================================================
 * PREDICTION SECTION
 * ============================================================ */

const PredictionSection = ({
  prediction,
  loading,
  error,
  onRetry,
}) => {
  if (loading) {
    return (
      <div className="card border-0 shadow-sm rounded-3">

        <div className="card-body py-5 text-center">

          <div
            className="bg-primary-subtle text-primary rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3"
            style={{
              width: 52,
              height: 52,
            }}
          >
            <FaSpinner
              className="spin"
              size={22}
            />
          </div>

          <h5 className="fw-bold">
            Running AI Prediction
          </h5>

          <p className="text-muted small mb-0">
            XGBoost prediction engine
            is calculating projected
            liability and risk indicators.
          </p>

        </div>

      </div>
    );
  }

  if (error) {
    return (
      <div className="card border-0 shadow-sm rounded-3">

        <div className="card-body p-4">

          <div className="d-flex align-items-start gap-3 text-danger">

            <div
              className="bg-danger-subtle rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              style={{
                width: 42,
                height: 42,
              }}
            >
              <FaExclamationCircle />
            </div>

            <div>

              <strong>
                Prediction unavailable
              </strong>

              <p className="text-muted small my-2">
                {error}
              </p>

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

  const riskClass =
    getRiskClass(
      prediction.riskTrend
    );

  return (
    <div>

      {/* PREDICTION HEADER */}

      <div className="card border-0 shadow-sm rounded-3 mb-3">

        <div className="card-body p-3">

          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">

            <div>

              <div className="officer-label">
                AI Prediction
              </div>

              <h5 className="fw-bold mb-1 mt-1">
                {
                  prediction.targetRetPeriod
                }
              </h5>

              <small className="text-muted">
                Model:{" "}
                {displayText(
                  prediction.modelVersion
                )}{" "}
                • Source:{" "}
                {displayText(
                  prediction.predictionSource
                )}
              </small>

            </div>

            <div
              className={`d-flex align-items-center gap-2 px-3 py-2 rounded-3 ${riskClass ===
                "critical" ||
                riskClass ===
                "high"
                ? "bg-danger-subtle text-danger"
                : riskClass ===
                  "medium"
                  ? "bg-warning-subtle text-warning-emphasis"
                  : "bg-success-subtle text-success"
                }`}
            >

              <FaShieldAlt />

              <strong>
                {displayText(
                  prediction.riskTrend,
                  "LOW"
                )}
              </strong>

              <span className="font-monospace">
                Score{" "}
                {safeNumber(
                  prediction.forecastedRiskScore
                ).toFixed(2)}
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
            value={formatINRCompact(
              prediction.predictedOutputTax
            )}
            detail={formatINR(
              prediction.predictedOutputTax
            )}
            icon={
              <FaFileInvoiceDollar />
            }
            accent="primary"
          />
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <KpiCard
            title="Predicted ITC Available"
            value={formatINRCompact(
              prediction.predictedItcAvail
            )}
            detail={formatINR(
              prediction.predictedItcAvail
            )}
            icon={
              <FaBalanceScale />
            }
            accent="purple"
          />
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <KpiCard
            title="Predicted ITC Ratio"
            value={formatPercentage(
              prediction.predictedItcRatio
            )}
            detail="ITC / projected output tax"
            icon={
              <FaPercentage />
            }
            accent="success"
          />
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <KpiCard
            title="Expected Delay"
            value={`${safeNumber(
              prediction.delayDays
            )} days`}
            detail={
              prediction.estimatedFilingDate ||
              "Filing date unavailable"
            }
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
                icon={
                  <FaShieldAlt />
                }
                title="Prediction Risk Factors"
                subtitle="AI-generated compliance indicators"
              />

              <PredictionRow
                label="Probability of Default"
                value={formatPercentage(
                  prediction.probabilityOfDefault
                )}
              />

              <PredictionRow
                label="Risk Category"
                value={
                  prediction.riskTrend
                }
              />

              <PredictionRow
                label="Primary Risk Factor"
                value={
                  prediction.primaryRiskFactor
                }
              />

              <PredictionRow
                label="Default Prediction"
                value={
                  prediction.defaultPredicted
                    ? "YES"
                    : "NO"
                }
              />

            </div>

          </div>

        </div>

        <div className="col-12 col-xl-6">

          <div className="card border-0 shadow-sm rounded-3 h-100">

            <div className="card-body p-3">

              <PanelHeader
                icon={
                  <FaClock />
                }
                title="Filing Projection"
                subtitle="Expected filing timeline"
              />

              <PredictionRow
                label="Due Date"
                value={
                  prediction.dueDate
                }
              />

              <PredictionRow
                label="Estimated Filing Date"
                value={
                  prediction.estimatedFilingDate
                }
              />

              <PredictionRow
                label="Expected Delay"
                value={`${safeNumber(
                  prediction.delayDays
                )} days`}
              />

              <PredictionRow
                label="Calculated Late Fee"
                value={formatINR(
                  prediction.calculatedLateFee
                )}
              />

            </div>

          </div>

        </div>

      </div>

      {prediction.nilReturn && (
        <div className="alert alert-success border-0 shadow-sm rounded-3 mt-3 d-flex align-items-center gap-2">

          <FaCheckCircle />

          <div>

            <strong className="d-block">
              Nil Return Prediction
            </strong>

            <small>
              The AI model predicts no
              taxable output and no
              available ITC for the
              projected return period.
            </small>

          </div>

        </div>
      )}

    </div>
  );
};

/* ============================================================
 * PREDICTION ROW
 * ============================================================ */

const PredictionRow = ({
  label,
  value,
}) => (
  <div className="d-flex justify-content-between align-items-start gap-3 border-bottom py-2">

    <span
      className="text-muted small"
    >
      {label}
    </span>

    <strong
      className="text-end"
      style={{
        fontSize: "0.88rem",
      }}
    >
      {displayText(value)}
    </strong>

  </div>
);

/* ============================================================
 * SUMMARY ITEM
 * ============================================================ */

const SummaryItem = ({
  label,
  value,
}) => (
  <div className="d-flex justify-content-between align-items-center border-bottom py-2">

    <span className="text-muted small">
      {label}
    </span>

    <strong
      className="font-monospace text-end"
      style={{
        fontSize: "0.88rem",
      }}
    >
      {value}
    </strong>

  </div>
);

/* ============================================================
 * PANEL HEADER
 * ============================================================ */

const PanelHeader = ({
  icon,
  title,
  subtitle,
  action,
}) => (
  <div className="d-flex align-items-center justify-content-between gap-2 p-3 border-bottom">

    <div className="d-flex align-items-center gap-2">

      <div
        className="bg-primary-subtle text-primary rounded-2 d-flex align-items-center justify-content-center flex-shrink-0"
        style={{
          width: 34,
          height: 34,
        }}
      >
        {React.cloneElement(
          icon,
          { size: 14 }
        )}
      </div>

      <div>

        <h6 className="mb-0 fw-bold text-dark">
          {title}
        </h6>

        {subtitle && (
          <small className="text-muted">
            {subtitle}
          </small>
        )}

      </div>

    </div>

    {action}

  </div>
);

/* ============================================================
 * TAB BUTTON
 * ============================================================ */

const TabButton = ({
  active,
  onClick,
  icon,
  label,
}) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    className={`btn btn-sm officer-tab rounded-2 d-flex align-items-center gap-1 px-3 ${active
      ? "btn-primary shadow-sm"
      : "btn-light text-secondary"
      }`}
    onClick={onClick}
    style={{
      fontSize: "0.8rem",
      minHeight: 34,
      fontWeight: 600,
    }}
  >
    {React.cloneElement(
      icon,
      { size: 12 }
    )}

    <span>{label}</span>
  </button>
);

/* ============================================================
 * EMPTY STATE
 * ============================================================ */

const EmptyState = ({
  message,
}) => (
  <div className="p-4 text-center">

    <div
      className="bg-light text-secondary rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2"
      style={{
        width: 42,
        height: 42,
      }}
    >
      <FaHistory />
    </div>

    <span className="text-muted small">
      {message}
    </span>

  </div>
);

/* ============================================================
 * BOOTSTRAP BADGE HELPERS
 * ============================================================ */

const getDelayBadgeClass = (
  days
) => {
  const value = safeNumber(days);

  if (value >= 30) {
    return "bg-danger-subtle text-danger";
  }

  if (value >= 15) {
    return "bg-danger-subtle text-danger";
  }

  if (value > 0) {
    return "bg-warning-subtle text-warning-emphasis";
  }

  return "bg-success-subtle text-success";
};

const getFilingBadgeClass = (
  status
) => {
  const value = String(
    status || "FILED"
  )
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

export default GstinAnalysisPage;
