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
      className="officer-topbar border-bottom mb-4 sticky-top shadow"
      style={{ zIndex: 1000 }}
    >
      <div className="container-fluid px-2 px-sm-3 px-lg-4 py-2 py-sm-3">

        <div className="d-flex flex-column flex-xl-row justify-content-between align-items-stretch align-items-xl-center gap-3">

          {/* PAGE TITLE */}

          <div className="d-flex align-items-center gap-2 flex-shrink-0">

            <div
              className="officer-logo-box rounded-2 d-flex align-items-center justify-content-center shadow-sm"
              style={{
                width: 40,
                height: 40,
              }}
            >
              <FaIdBadge size={18} />
            </div>

            <div
              className="min-width-0"
              style={{ minWidth: 0 }}
            >
              <div className="officer-subtitle fw-medium text-truncate" style={{ fontSize: "0.72rem", }}>
                <h5 className="fw-bold text-dark mb-0 text-truncate">GSTR-3B Return Compliance &amp; AI Risk Assessment</h5>
              </div>
            </div>

          </div>

          {/* HEADER CONTROLS */}

          <div className="d-flex flex-wrap align-items-center justify-content-xl-end gap-2">

            <form
              onSubmit={handleAnalyze}
              noValidate
              className="d-flex align-items-center"
            >
              <div
                className={`input-group input-group-sm ${inputError
                  ? "border border-danger rounded-2"
                  : ""
                  }`}
                style={{
                  width:
                    "min(360px, 100%)",
                }}
              >

                <span className="input-group-text bg-light border-end-0 py-1 px-2">
                  <FaSearch
                    size={12}
                    className="text-secondary"
                  />
                </span>

                <input
                  id="gstin-analysis-input"
                  type="text"
                  value={gstinInput}
                  onChange={handleGstinChange}
                  placeholder="Enter 15-character GSTIN"
                  maxLength={GSTIN_LENGTH}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="GSTIN"
                  aria-invalid={Boolean(
                    inputError
                  )}
                  className="form-control border-start-0 border-end-0 py-1 px-2 shadow-none"
                  style={{
                    height: "32px",
                    fontSize: "0.85rem",
                    fontFamily:
                      "monospace",
                    fontWeight: 700,
                    textTransform:
                      "uppercase",
                  }}
                />

                <span className="input-group-text bg-white border-start-0 py-1 px-2">
                  <small
                    className={
                      gstinInput.length ===
                        GSTIN_LENGTH
                        ? "text-success fw-bold"
                        : "text-muted"
                    }
                    style={{
                      fontSize: "0.7rem",
                    }}
                  >
                    {gstinInput.length}/
                    {GSTIN_LENGTH}
                  </small>
                </span>

              </div>

              <button
                type="submit"
                className="btn btn-sm btn-primary rounded-2 d-flex align-items-center justify-content-center gap-1 shadow-sm ms-2 px-2"
                style={{
                  fontSize: "0.8rem",
                  height: "32px",
                  whiteSpace:
                    "nowrap",
                }}
                disabled={
                  isBusy ||
                  !gstinInput
                }
              >
                {loading ? (
                  <>
                    <FaSpinner
                      className="spin"
                      size={12}
                    />
                    <span className="d-none d-sm-inline">
                      Analyzing...
                    </span>
                  </>
                ) : (
                  <>
                    <FaSearch size={12} />
                    <span className="d-none d-sm-inline">
                      Analyze
                    </span>
                  </>
                )}
              </button>
            </form>

            {/* RISK */}

            {analysis && (
              <RiskHeaderBadge
                category={
                  analysis.riskCategory
                }
                score={
                  analysis.currentRiskScore
                }
              />
            )}

            {/* REFRESH */}

            {analysis && (
              <button
                type="button"
                className="btn btn-sm btn-primary rounded-2 d-flex align-items-center justify-content-center gap-1 shadow-sm px-2"
                style={{
                  fontSize: "0.8rem",
                  height: "32px",
                }}
                disabled={isBusy}
                onClick={
                  handleRefresh
                }
              >
                <FaSyncAlt
                  size={12}
                  className={
                    loading
                      ? "spin"
                      : ""
                  }
                />

                <span className="d-none d-sm-inline">
                  Refresh
                </span>
              </button>
            )}

            {/* BACK */}

            {onBack && (
              <button
                type="button"
                className="btn btn-sm btn-outline-light rounded-2 px-2"
                style={{
                  height: "32px",
                  fontSize: "0.8rem",
                }}
                onClick={onBack}
              >
                ← Back
              </button>
            )}

          </div>
        </div>

        {/* INPUT ERROR */}

        {inputError && (
          <div className="mt-2 text-warning d-flex align-items-center gap-1">
            <FaExclamationCircle
              size={11}
            />

            <span
              style={{
                fontSize: "0.75rem",
              }}
            >
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

        <div className="card officer-profile-card mb-3">
          <div className="card-body p-0">
            <div className="row g-0 align-items-stretch">

              {/* =====================================================
          GSTIN
          ===================================================== */}
              <div className="col-12 col-lg-4">
                <div className="officer-profile-item officer-gstin-section">

                  <div className="officer-profile-icon officer-icon-navy">
                    <FaBuilding size={17} />
                  </div>

                  <div className="officer-profile-content">
                    <div className="officer-profile-label">
                      GST Identification Number
                    </div>

                    <div
                      className="officer-profile-gstin"
                      title={displayText(analysis.gstin)}
                    >
                      {displayText(analysis.gstin)}
                    </div>

                    <div className="officer-profile-status">
                      <span
                        className={`officer-status-badge ${String(analysis.status || "ACTIVE").toUpperCase() ===
                          "ACTIVE"
                          ? "officer-status-active"
                          : "officer-status-warning"
                          }`}
                      >
                        <FaCheckCircle size={9} />
                        {displayText(analysis.status, "ACTIVE")}
                      </span>

                      <span className="officer-status-caption">
                        Registration Status
                      </span>
                    </div>
                  </div>

                </div>
              </div>

              {/* =====================================================
          TAXPAYER
          ===================================================== */}
              <div className="col-12 col-sm-6 col-lg-3">
                <div className="officer-profile-item">

                  <div className="officer-profile-icon officer-icon-blue">
                    <FaUserTie size={16} />
                  </div>

                  <div className="officer-profile-content">
                    <div className="officer-profile-label">
                      Taxpayer
                    </div>

                    <div
                      className="officer-profile-main-value officer-value-truncate"
                      title={displayText(analysis.legalName)}
                    >
                      {displayText(analysis.legalName)}
                    </div>

                    {analysis.tradeName && (
                      <div
                        className="officer-profile-sub-value officer-value-truncate"
                        title={displayText(analysis.tradeName)}
                      >
                        {displayText(analysis.tradeName)}
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* =====================================================
          JURISDICTION
          ===================================================== */}
              <div className="col-12 col-sm-6 col-lg-2">
                <div className="officer-profile-item">

                  <div className="officer-profile-icon officer-icon-slate">
                    <FaLandmark size={15} />
                  </div>

                  <div className="officer-profile-content">
                    <div className="officer-profile-label">
                      Jurisdiction
                    </div>

                    <div
                      className="officer-profile-main-value officer-value-truncate"
                      title={displayText(analysis.jurisdiction)}
                    >
                      {displayText(analysis.jurisdiction)}
                    </div>
                  </div>

                </div>
              </div>

              {/* =====================================================
          RETURNS
          ===================================================== */}
              <div className="col-6 col-lg-1">
                <div className="officer-stat-item">
                  <div className="officer-profile-label">
                    Returns
                  </div>

                  <div className="officer-stat-value">
                    {history.length}
                  </div>

                  <div className="officer-stat-caption">
                    Months
                  </div>
                </div>
              </div>

              {/* =====================================================
          DELAYED RETURNS
          ===================================================== */}
              <div className="col-6 col-lg-2">
                <div className="officer-stat-item officer-delay-stat">

                  <div className="officer-profile-label">
                    Delayed Returns
                  </div>

                  <div
                    className={`officer-stat-value ${delayedReturns > 0
                      ? "officer-stat-danger"
                      : "officer-stat-success"
                      }`}
                  >
                    {delayedReturns}
                  </div>

                  <div className="officer-stat-caption">
                    {totalDelayDays} delay days
                  </div>

                </div>
              </div>
            </div>
          </div>




        </div>

      </div>

      {/* ======================================================
       * KPI CARDS
       * ====================================================== */}

      <div className="px-2 px-sm-3 px-lg-4">

        <div className="row g-2 g-sm-3 mb-4">

          <div className="col-12 col-sm-6 col-xl-3"> <KpiCard title="Lifetime Taxable Value" value={formatINRCompact(analysis.lifetimeTaxableValue)} detail={formatINR(analysis.lifetimeTaxableValue)} icon={<FaChartLine />} accent="taxable-value" /> </div>

          <div className="col-12 col-sm-6 col-xl-3"> <KpiCard title="Lifetime Cash Paid" value={formatINRCompact(analysis.lifetimeCashPaid)} detail={formatINR(analysis.lifetimeCashPaid)} icon={<FaMoneyBillWave />} accent="cash-paid" /> </div> <div className="col-12 col-sm-6 col-xl-3"> <KpiCard title="ITC Utilized" value={formatINRCompact(analysis.lifetimeItcUtilized)} detail={formatINR(analysis.lifetimeItcUtilized)} icon={<FaBalanceScale />} accent="itc-utilized" /> </div> <div className="col-12 col-sm-6 col-xl-3"> <RiskKpiCard score={analysis.currentRiskScore} category={analysis.riskCategory} /> </div>

        </div>

      </div>

      {/* ======================================================
       * TABS
       * ====================================================== */}

      <div className="px-2 px-sm-3 px-lg-4">

        <div className="card border-0 shadow-sm rounded-3 mb-3">

          <div
            className="d-flex flex-wrap align-items-center gap-1 p-2"
            role="tablist"
            aria-label="GSTIN analysis sections"
          >

            <TabButton
              active={
                activeTab ===
                "overview"
              }
              onClick={() =>
                setActiveTab(
                  "overview"
                )
              }
              icon={<FaChartLine />}
              label="Overview"
            />

            <TabButton
              active={
                activeTab ===
                "history"
              }
              onClick={() =>
                setActiveTab(
                  "history"
                )
              }
              icon={<FaTable />}
              label="GSTR-3B History"
            />

            <TabButton
              active={
                activeTab === "tax"
              }
              onClick={() =>
                setActiveTab("tax")
              }
              icon={
                <FaFileInvoiceDollar />
              }
              label="Tax Breakdown"
            />

            <TabButton
              active={
                activeTab === "risk"
              }
              onClick={() =>
                setActiveTab("risk")
              }
              icon={<FaShieldAlt />}
              label="Risk & Alerts"
            />

            <TabButton
              active={
                activeTab ===
                "prediction"
              }
              onClick={() =>
                setActiveTab(
                  "prediction"
                )
              }
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

              <div className="col-12 col-xl-6">

                <BootstrapPanel
                  icon={
                    <FaFileInvoiceDollar />
                  }
                  title="Tax Summary"
                  subtitle="Aggregated GSTR-3B values"
                >

                  <div className="row g-2">

                    <SummaryBootstrapItem
                      label="Taxable Value"
                      value={formatINRCompact(
                        totals.taxableValue
                      )}
                    />

                    <SummaryBootstrapItem
                      label="Output Tax"
                      value={formatINRCompact(
                        totals.outputTax
                      )}
                    />

                    <SummaryBootstrapItem
                      label="ITC Claimed"
                      value={formatINRCompact(
                        totals.itc
                      )}
                    />

                    <SummaryBootstrapItem
                      label="Cash Paid"
                      value={formatINRCompact(
                        totals.cash
                      )}
                    />

                    <SummaryBootstrapItem
                      label="RCM Tax"
                      value={formatINRCompact(
                        totals.rcm
                      )}
                    />

                    <SummaryBootstrapItem
                      label="Delayed Returns"
                      value={delayedReturns}
                      valueClass={
                        delayedReturns >
                          0
                          ? "text-danger"
                          : "text-success"
                      }
                    />

                  </div>

                </BootstrapPanel>

              </div>

              <div className="col-12 col-xl-6">

                <BootstrapPanel
                  icon={<FaPercentage />}
                  title="Compliance Indicators"
                  subtitle="Calculated from analysed returns"
                >

                  <RatioBootstrapRow
                    label="Average ITC Ratio"
                    value={
                      averageItcRatio
                    }
                  />

                  <RatioBootstrapRow
                    label="Average Cash Payment Ratio"
                    value={
                      averageCashRatio
                    }
                  />

                  <div className="d-flex align-items-center justify-content-between border-top pt-3 mt-3">

                    <div>
                      <div className="text-muted small">
                        Total Filing Delay
                      </div>

                      <strong className="font-monospace">
                        {
                          totalDelayDays
                        }{" "}
                        days
                      </strong>
                    </div>

                    <div
                      className="bg-warning-subtle text-warning-emphasis rounded-circle d-flex align-items-center justify-content-center"
                      style={{
                        width: 38,
                        height: 38,
                      }}
                    >
                      <FaClock />
                    </div>

                  </div>

                </BootstrapPanel>

              </div>

            </div>

            <TaxComponentCards
              totals={totals}
            />

            <RecentHistory
              history={history}
              onViewAll={() =>
                setActiveTab(
                  "history"
                )
              }
            />

            <AlertsPanel
              alerts={alerts}
              onViewAll={() =>
                setActiveTab("risk")
              }
            />

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
 * TAX COMPONENT CARDS
 * ============================================================ */

const TaxComponentCards = ({
  totals,
}) => {
  const components = [
    {
      label: "IGST",
      value: totals.igst,
    },
    {
      label: "CGST",
      value: totals.cgst,
    },
    {
      label: "SGST",
      value: totals.sgst,
    },
    {
      label: "CESS",
      value: totals.cess,
    },
  ];

  return (
    <div className="row g-2 g-sm-3 mb-3">

      {components.map(
        (component) => (
          <div
            className="col-6 col-lg-3"
            key={
              component.label
            }
          >

            <div className="card border-0 shadow-sm rounded-3 h-100">

              <div className="card-body p-3">

                <div className="officer-label">
                  {component.label}
                </div>

                <div className="fw-bold font-monospace text-dark mt-1" style={{ fontSize: "1rem" }}>
                  {formatINRCompact(
                    component.value
                  )}
                </div>

                <small className="text-muted">
                  {formatINR(
                    component.value
                  )}
                </small>

              </div>

            </div>

          </div>
        )
      )}

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
         * GST TAX COMPOSITION
         * ========================================================= */}

        <div className="col-12 col-xl-6">

          <div className="card officer-tax-card h-100">

            <div className="card-body p-0">

              <PanelHeader
                icon={<FaBalanceScale />}
                title="GST Tax Composition"
                subtitle="Aggregated tax components"
              />

              <div className="officer-tax-content">

                <TaxBreakdownRow
                  label="IGST"
                  value={totals.igst}
                  total={safeOutputTax}
                  className="tax-row-igst"
                />

                <TaxBreakdownRow
                  label="CGST"
                  value={totals.cgst}
                  total={safeOutputTax}
                  className="tax-row-cgst"
                />

                <TaxBreakdownRow
                  label="SGST"
                  value={totals.sgst}
                  total={safeOutputTax}
                  className="tax-row-sgst"
                />

                <TaxBreakdownRow
                  label="CESS"
                  value={totals.cess}
                  total={safeOutputTax}
                  className="tax-row-cess"
                />

                {/* Total Output Tax */}

                <div className="officer-tax-total">

                  <div className="officer-tax-total-label">
                    <span className="officer-tax-total-indicator" />
                    <span>Total Output Tax</span>
                  </div>

                  <strong className="officer-tax-total-value">
                    {formatINR(safeOutputTax)}
                  </strong>

                </div>

              </div>

            </div>

          </div>

        </div>


        {/* =========================================================
         * PAYMENT & ITC
         * ========================================================= */}

        <div className="col-12 col-xl-6">

          <div className="card officer-payment-card h-100">

            <div className="card-body p-0">

              <PanelHeader
                icon={<FaMoneyBillWave />}
                title="Payment & ITC"
                subtitle="Tax utilization indicators"
              />

              <div className="officer-payment-content">

                {/* ITC */}

                <div className="officer-payment-item officer-itc-item">

                  <div className="officer-payment-icon">
                    <FaFileInvoiceDollar size={14} />
                  </div>

                  <div className="officer-payment-info">

                    <div className="officer-payment-label">
                      ITC Claimed
                    </div>

                    <div className="officer-payment-value">
                      {formatINR(safeItc)}
                    </div>

                  </div>

                </div>


                {/* Cash */}

                <div className="officer-payment-item officer-cash-item">

                  <div className="officer-payment-icon">
                    <FaMoneyBillWave size={14} />
                  </div>

                  <div className="officer-payment-info">

                    <div className="officer-payment-label">
                      Cash Paid
                    </div>

                    <div className="officer-payment-value">
                      {formatINR(safeCash)}
                    </div>

                  </div>

                </div>


                {/* RCM */}

                <div className="officer-payment-item officer-rcm-item">

                  <div className="officer-payment-icon">
                    <FaExchangeAlt size={14} />
                  </div>

                  <div className="officer-payment-info">

                    <div className="officer-payment-label">
                      RCM Tax
                    </div>

                    <div className="officer-payment-value">
                      {formatINR(safeRcm)}
                    </div>

                  </div>

                </div>


                {/* Ratio indicators */}

                <div className="officer-ratio-grid">

                  <div className="officer-ratio-box officer-cash-ratio-box">

                    <div className="officer-ratio-label">
                      Cash / Output Tax
                    </div>

                    <div className="officer-ratio-value">
                      {safeOutputTax > 0
                        ? formatPercentage(
                          safeCash / safeOutputTax
                        )
                        : "0.00%"}
                    </div>

                  </div>


                  <div className="officer-ratio-box officer-itc-ratio-box">

                    <div className="officer-ratio-label">
                      ITC / Output Tax
                    </div>

                    <div className="officer-ratio-value">
                      {safeOutputTax > 0
                        ? formatPercentage(
                          safeItc / safeOutputTax
                        )
                        : "0.00%"}
                    </div>

                  </div>

                </div>

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
 * RISK SECTION
 * ============================================================ */

const RiskSection = ({
  analysis,
  alerts,
  delayedReturns,
  totalDelayDays,
}) => {
  const riskClass =
    getRiskClass(
      analysis.riskCategory
    );

  const returnsCount =
    Array.isArray(
      analysis.last6MonthsHistory
    )
      ? analysis.last6MonthsHistory
        .length
      : 0;

  return (
    <div>

      <div className="row g-3 mb-3">

        <div className="col-12 col-lg-6">

          <div
            className={`card border-0 shadow-sm rounded-3 h-100 border-start border-4 ${riskClass ===
              "critical" ||
              riskClass ===
              "high"
              ? "border-danger"
              : riskClass ===
                "medium"
                ? "border-warning"
                : "border-success"
              }`}
          >

            <div className="card-body p-3">

              <div className="d-flex align-items-center gap-3">

                <RiskGauge
                  score={
                    analysis.currentRiskScore
                  }
                  category={
                    analysis.riskCategory
                  }
                />

                <div>

                  <div className="text-muted small">
                    Current Risk Category
                  </div>

                  <strong
                    className={`d-block fs-5 ${riskClass ===
                      "critical" ||
                      riskClass ===
                      "high"
                      ? "text-danger"
                      : riskClass ===
                        "medium"
                        ? "text-warning-emphasis"
                        : "text-success"
                      }`}
                  >
                    {displayText(
                      analysis.riskCategory,
                      "LOW"
                    )}
                  </strong>

                  <small className="text-muted">
                    Score{" "}
                    {safeNumber(
                      analysis.currentRiskScore
                    ).toFixed(2)}{" "}
                    of 10.00
                  </small>

                </div>

              </div>

            </div>

          </div>

        </div>

        <div className="col-6 col-lg-3">

          <div className="card border-0 shadow-sm rounded-3 h-100">

            <div className="card-body p-3">

              <div className="text-muted small">
                Delayed Returns
              </div>

              <strong
                className={`d-block fs-3 font-monospace mt-1 ${delayedReturns >
                  0
                  ? "text-danger"
                  : "text-success"
                  }`}
              >
                {
                  delayedReturns
                }
              </strong>

              <small className="text-muted">
                out of{" "}
                {
                  returnsCount
                }{" "}
                analysed
              </small>

            </div>

          </div>

        </div>

        <div className="col-6 col-lg-3">

          <div className="card border-0 shadow-sm rounded-3 h-100">

            <div className="card-body p-3">

              <div className="text-muted small">
                Total Delay
              </div>

              <strong className="d-block fs-3 font-monospace mt-1 text-warning-emphasis">
                {
                  totalDelayDays
                }
              </strong>

              <small className="text-muted">
                filing delay days
              </small>

            </div>

          </div>

        </div>

      </div>

      <AlertsPanel
        alerts={alerts}
        onViewAll={() => { }}
      />

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
