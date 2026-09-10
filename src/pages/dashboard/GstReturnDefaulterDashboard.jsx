import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useDeferredValue,
  useState,
} from "react";

import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock3,
  Download,
  FileText,
  Filter,
  FilterX,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  UserX,
  X,
} from "lucide-react";

import {
  fetchReturnDefaulters,
  issueDefaulterNotice,
  fetchAllReturnPeriods,
} from "../../services/dashboardService";

import "./GstReturnDefaulterDashboard.css";

/* =========================================================
   CONFIGURATION
========================================================= */

const DEFAULT_PAGE_SIZE = 10;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/*
 * Safety fallback only when backend does not return totalElements.
 *
 * NOTE:
 * For truly huge datasets, backend should ideally expose a
 * dedicated "fetch all" endpoint or export endpoint.
 */
const FALLBACK_SERVER_FETCH_SIZE = 750000;

const FETCH_SIZE_BUFFER = 200;

const MAX_RISK_SCORE = 100;

/* =========================================================
   RISK CONFIG
========================================================= */

const RISK_CONFIG = {
  CRITICAL: {
    label: "Critical",
    badge:
      "bg-danger-subtle text-danger border-danger-subtle",
    text: "text-danger",
  },

  HIGH: {
    label: "High",
    badge:
      "bg-warning-subtle text-warning-emphasis border-warning-subtle",
    text: "text-warning-emphasis",
  },

  MEDIUM: {
    label: "Medium",
    badge:
      "bg-info-subtle text-info-emphasis border-info-subtle",
    text: "text-info-emphasis",
  },

  LOW: {
    label: "Low",
    badge:
      "bg-success-subtle text-success border-success-subtle",
    text: "text-success",
  },
};

/* =========================================================
   DELAY CONFIG
========================================================= */

const DELAY_CONFIG = {
  CRITICAL: {
    badge:
      "bg-danger-subtle text-danger border-danger-subtle",
  },

  WARNING: {
    badge:
      "bg-warning-subtle text-warning-emphasis border-warning-subtle",
  },

  NORMAL: {
    badge:
      "bg-light text-secondary border-secondary-subtle",
  },
};

/* =========================================================
   GLOBAL HELPERS
========================================================= */

const isAbortError = (error) => {
  return (
    error?.name === "AbortError" ||
    error?.name === "CanceledError" ||
    error?.code === "ERR_CANCELED"
  );
};

const toSafeNumber = (value, fallback = 0) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const formatCurrency = (amount) => {
  const value = toSafeNumber(amount);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

const formatNumber = (value) => {
  const number = toSafeNumber(value);

  return new Intl.NumberFormat("en-IN").format(number);
};

/* =========================================================
   PERIOD HELPERS
========================================================= */

const getPeriodValue = (period) => {
  if (
    period === null ||
    period === undefined ||
    period === ""
  ) {
    return "";
  }

  if (typeof period === "object") {
    return String(
      period.value ??
        period.id ??
        period.retPeriod ??
        period.period ??
        period.code ??
        Object.values(period)[0] ??
        ""
    );
  }

  return String(period);
};

const formatPeriodLabel = (period) => {
  if (
    period === null ||
    period === undefined ||
    period === ""
  ) {
    return "";
  }

  if (
    typeof period === "object" &&
    (period.label || period.name)
  ) {
    return String(period.label || period.name);
  }

  const value = getPeriodValue(period).trim();

  if (!value) return "";

  /*
   * Expected MMYYYY.
   */
  if (!/^\d{6}$/.test(value)) {
    return value;
  }

  const month = Number(value.substring(0, 2));
  const year = Number(value.substring(2, 6));

  if (
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(year)
  ) {
    return value;
  }

  const date = new Date(year, month - 1, 1);

  return date.toLocaleString("en-IN", {
    month: "short",
    year: "numeric",
  });
};

/* =========================================================
   RISK HELPERS
========================================================= */

const getRiskCategory = (row) => {
  const risk = String(
    row?.defaulterRiskLevel ??
      row?.riskLevel ??
      row?.riskCategory ??
      "MEDIUM"
  )
    .trim()
    .toUpperCase();

  return RISK_CONFIG[risk] ? risk : "MEDIUM";
};

const getRiskScorePct = (row) => {
  const raw =
    row?.xgbRiskScore ??
    row?.riskScore ??
    row?.riskScorePct;

  if (
    raw === undefined ||
    raw === null ||
    raw === ""
  ) {
    return null;
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    return null;
  }

  const percentage = value <= 1 ? value * 100 : value;

  return Math.min(
    MAX_RISK_SCORE,
    Math.max(0, percentage)
  );
};

const getDelayDays = (row) => {
  return Math.max(
    0,
    Math.trunc(
      toSafeNumber(
        row?.filingDelayDays ??
          row?.delayDays ??
          row?.filing_delay_days,
        0
      )
    )
  );
};

const getDelayTier = (delay) => {
  if (delay >= 90) return "CRITICAL";

  if (delay >= 30) return "WARNING";

  return "NORMAL";
};

const getActionRequired = (row) => {
  const action =
    row?.statutoryActionRequired ??
    row?.actionRequired ??
    row?.statutoryAction ??
    "Under Audit Scrutiny";

  return String(action).trim() || "Under Audit Scrutiny";
};

/* =========================================================
   RECORD ENRICHMENT
========================================================= */

const enrichRecord = (row) => {
  const safeRow =
    row && typeof row === "object" ? row : {};

  const delay = getDelayDays(safeRow);

  const risk = getRiskCategory(safeRow);

  const score = getRiskScorePct(safeRow);

  const gstin = String(
    safeRow?.gstin ??
      safeRow?.GSTIN ??
      ""
  ).trim();

  const action = getActionRequired(safeRow);

  const period = getPeriodValue(
    safeRow?.retPeriod ??
      safeRow?.returnPeriod ??
      ""
  );

  return {
    ...safeRow,

    gstin,

    retPeriod: period,

    _risk: risk,

    _score: score ?? 0,

    _delay: delay,

    _gstinLower: gstin.toLowerCase(),

    _periodLower:
      formatPeriodLabel(period).toLowerCase(),

    _action: action,

    _actionLower: action.toLowerCase(),
  };
};

/* =========================================================
   DEFAULT NOTICE REASON
========================================================= */

const buildDefaultReason = (
  row,
  retPeriod
) => {
  const period =
    row?.retPeriod ||
    retPeriod ||
    "";

  const delay = getDelayDays(row);

  const risk = getRiskCategory(row);

  const score = getRiskScorePct(row);

  const scoreText =
    score === null
      ? ""
      : ` with risk score ${score.toFixed(0)}%`;

  return (
    `GST Audit & Compliance Enforcement: ` +
    `Non-filing/anomaly identified for GSTR return ` +
    `period ${period} (${formatPeriodLabel(period)}) ` +
    `with filing delay of ${delay} days. ` +
    `Risk classification: ${risk}${scoreText}.`
  );
};

/* =========================================================
   CSV
========================================================= */

const csvEscape = (value) => {
  return `"${String(value ?? "")
    .replace(/"/g, '""')
    .replace(/\r?\n|\r/g, " ")}"`;
};

const exportToCSV = (
  data,
  filename = "GST_Defaulter_Report.csv"
) => {
  if (!Array.isArray(data) || data.length === 0) {
    return false;
  }

  const headers = [
    "GSTIN",
    "Return Period",
    "Filing Delay (Days)",
    "Taxable Value (INR)",
    "Total Output Tax (INR)",
    "Statutory Action Required",
    "Risk Level",
    "Risk Score (%)",
  ];

  const rows = data.map((row) => [
    csvEscape(row.gstin),

    csvEscape(
      formatPeriodLabel(row.retPeriod)
    ),

    getDelayDays(row),

    toSafeNumber(row.taxableValue),

    toSafeNumber(row.totalOutputTax),

    csvEscape(getActionRequired(row)),

    csvEscape(getRiskCategory(row)),

    getRiskScorePct(row) ?? 0,
  ]);

  const csv = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\r\n");

  const blob = new Blob(
    ["\uFEFF", csv],
    {
      type: "text/csv;charset=utf-8;",
    }
  );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);

  return true;
};

/* =========================================================
   TOAST
========================================================= */

const Toast = React.memo(
  ({ toast, onClose }) => {
    if (!toast) return null;

    const isError =
      toast.type === "error";

    return (
      <div
        className="position-fixed top-0 end-0 p-3"
        style={{ zIndex: 2000 }}
      >
        <div
          className={`toast show gst-toast border-0 ${
            isError
              ? "bg-danger"
              : "bg-dark"
          } text-white`}
          role="alert"
        >
          <div className="d-flex align-items-start p-3">

            {isError ? (
              <AlertCircle
                size={20}
                className="me-2 mt-1 flex-shrink-0"
              />
            ) : (
              <CheckCircle2
                size={20}
                className="me-2 mt-1 flex-shrink-0"
              />
            )}

            <div className="flex-grow-1">

              <div className="fw-semibold">
                {isError
                  ? "Operation Failed"
                  : "Success"}
              </div>

              <div className="small opacity-75 mt-1">
                {toast.message}
              </div>

            </div>

            <button
              type="button"
              className="btn btn-sm text-white p-0 ms-3"
              onClick={onClose}
              aria-label="Close notification"
            >
              <X size={16} />
            </button>

          </div>
        </div>
      </div>
    );
  }
);

/* =========================================================
   PERIOD SELECTOR
========================================================= */

const SearchablePeriodSelect =
  React.memo(
    ({
      options = [],
      value,
      onChange,
      loading,
    }) => {
      const [open, setOpen] =
        useState(false);

      const [search, setSearch] =
        useState("");

      const containerRef =
        useRef(null);

      useEffect(() => {
        const handleOutside = (
          event
        ) => {
          if (
            containerRef.current &&
            !containerRef.current.contains(
              event.target
            )
          ) {
            setOpen(false);
          }
        };

        const handleKeyDown = (
          event
        ) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        };

        document.addEventListener(
          "mousedown",
          handleOutside
        );

        document.addEventListener(
          "keydown",
          handleKeyDown
        );

        return () => {
          document.removeEventListener(
            "mousedown",
            handleOutside
          );

          document.removeEventListener(
            "keydown",
            handleKeyDown
          );
        };
      }, []);

      const selectedLabel =
        useMemo(() => {
          const selected =
            options.find(
              (item) =>
                getPeriodValue(item) ===
                value
            );

          return selected
            ? formatPeriodLabel(selected)
            : value ||
                "Select period";
        }, [options, value]);

      const filteredOptions =
        useMemo(() => {
          const query =
            search.trim().toLowerCase();

          if (!query) {
            return options;
          }

          return options.filter(
            (item) => {
              const val =
                getPeriodValue(item)
                  .toLowerCase();

              const label =
                formatPeriodLabel(item)
                  .toLowerCase();

              return (
                val.includes(query) ||
                label.includes(query)
              );
            }
          );
        }, [options, search]);

      return (
        <div
          ref={containerRef}
          className="position-relative gst-period-selector"
        >
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              setOpen((prev) => !prev)
            }
            className="btn btn-light border d-flex align-items-center justify-content-between w-100 rounded-2 px-3 py-2"
          >
            <span className="d-flex align-items-center gap-2 text-truncate">

              <Calendar
                size={16}
                className="text-primary flex-shrink-0"
              />

              <span className="text-truncate fw-semibold">
                {loading
                  ? "Loading..."
                  : selectedLabel}
              </span>

            </span>

            {loading ? (
              <Loader2
                size={15}
                className="spin ms-2"
              />
            ) : (
              <ChevronDown
                size={15}
                className="ms-2"
                style={{
                  transform: open
                    ? "rotate(180deg)"
                    : "none",
                  transition:
                    "transform .15s ease",
                }}
              />
            )}
          </button>

          {open && !loading && (
            <div
              className="position-absolute bg-white border rounded-3 shadow-lg p-2 mt-1"
              style={{
                zIndex: 1100,
                width: 260,
                left: 0,
              }}
            >
              <div className="input-group input-group-sm mb-2">

                <span className="input-group-text bg-light border-0">
                  <Search size={14} />
                </span>

                <input
                  autoFocus
                  type="text"
                  className="form-control bg-light border-0 shadow-none"
                  placeholder="Search period..."
                  value={search}
                  onChange={(e) =>
                    setSearch(
                      e.target.value
                    )
                  }
                />

              </div>

              <div
                className="overflow-auto"
                style={{
                  maxHeight: 230,
                }}
              >
                {filteredOptions.length ===
                0 ? (
                  <div className="text-center text-muted small py-4">
                    No period found
                  </div>
                ) : (
                  filteredOptions.map(
                    (item, index) => {
                      const val =
                        getPeriodValue(
                          item
                        );

                      const selected =
                        val === value;

                      return (
                        <button
                          key={
                            val ||
                            `period-${index}`
                          }
                          type="button"
                          className={`dropdown-item rounded-2 d-flex justify-content-between align-items-center py-2 ${
                            selected
                              ? "active"
                              : ""
                          }`}
                          onClick={() => {
                            onChange(val);
                            setOpen(false);
                            setSearch("");
                          }}
                        >
                          <span>
                            {formatPeriodLabel(
                              item
                            )}
                          </span>

                          {selected && (
                            <CheckCircle2
                              size={14}
                            />
                          )}
                        </button>
                      );
                    }
                  )
                )}
              </div>
            </div>
          )}
        </div>
      );
    }
  );

/* =========================================================
   KPI CARD
========================================================= */

const KpiCard = React.memo(
  ({
    title,
    value,
    subtitle,
    icon: Icon,
    variant = "primary",
    loading,
  }) => {
    const styles = {
      primary: {
        border: "border-primary",
        icon: "bg-primary-subtle text-primary",
      },

      danger: {
        border: "border-danger",
        icon: "bg-danger-subtle text-danger",
      },

      warning: {
        border: "border-warning",
        icon:
          "bg-warning-subtle text-warning-emphasis",
      },

      info: {
        border: "border-info",
        icon:
          "bg-info-subtle text-info-emphasis",
      },
    };

    const style =
      styles[variant] ||
      styles.primary;

    return (
      <div
        className={`gst-kpi-card border-start border-4 ${style.border} h-100`}
      >
        <div className="p-3">

          <div className="d-flex justify-content-between align-items-start">

            <div className="min-w-0">

              <div className="gst-kpi-label">
                {title}
              </div>

              <div className="gst-kpi-value">
                {loading ? (
                  <span className="placeholder-glow">
                    <span
                      className="placeholder col-7"
                      style={{
                        height: 28,
                      }}
                    />
                  </span>
                ) : (
                  formatNumber(value)
                )}
              </div>

              {subtitle && (
                <div className="gst-kpi-subtitle">
                  {subtitle}
                </div>
              )}

            </div>

            <div
              className={`gst-kpi-icon ${style.icon}`}
            >
              <Icon size={21} />
            </div>

          </div>

        </div>
      </div>
    );
  }
);

/* =========================================================
   BADGES
========================================================= */

const RiskBadge = ({
  category,
  score,
}) => {
  const config =
    RISK_CONFIG[category] ||
    RISK_CONFIG.MEDIUM;

  return (
    <div className="d-inline-flex flex-column align-items-center">

      <span
        className={`badge border gst-risk-badge ${config.badge}`}
      >
        {config.label}
      </span>

      {score !== null &&
        score !== undefined && (
          <span
            className={`gst-risk-score ${config.text}`}
          >
            Risk Score:{" "}
            {score.toFixed(0)}%
          </span>
        )}

    </div>
  );
};

const DelayBadge = ({
  delay,
}) => {
  const tier =
    getDelayTier(delay);

  const config =
    DELAY_CONFIG[tier];

  return (
    <span
      className={`badge border gst-delay-badge d-inline-flex align-items-center gap-1 ${config.badge}`}
    >
      <Clock3 size={11} />
      {formatNumber(delay)} days
    </span>
  );
};

const ActionBadge = ({
  action,
}) => {
  const safeAction =
    String(action || "").trim() ||
    "Under Audit Scrutiny";

  let cls =
    "bg-primary-subtle text-primary border-primary-subtle";

  const upperAction =
    safeAction.toUpperCase();

  if (
    upperAction.includes("REG-17")
  ) {
    cls =
      "bg-danger-subtle text-danger border-danger-subtle";
  } else if (
    upperAction.includes("3A")
  ) {
    cls =
      "bg-warning-subtle text-warning-emphasis border-warning-subtle";
  }

  return (
    <span
      className={`badge border gst-action-badge d-inline-flex align-items-center gap-1 ${cls}`}
    >
      <FileText
        size={12}
        className="flex-shrink-0"
      />

      <span>
        {safeAction}
      </span>
    </span>
  );
};

/* =========================================================
   NOTICE MODAL
========================================================= */

const NoticeModal = React.memo(
  ({
    show,
    record,
    retPeriod,
    onClose,
    onSubmit,
    submitting,
  }) => {
    const [reason, setReason] =
      useState("");

    useEffect(() => {
      if (!record) {
        setReason("");
        return;
      }

      setReason(
        buildDefaultReason(
          record,
          retPeriod
        )
      );
    }, [record, retPeriod]);

    if (!show || !record) {
      return null;
    }

    const riskCategory =
      getRiskCategory(record);

    const riskScore =
      getRiskScorePct(record);

    const period =
      record.retPeriod ||
      retPeriod;

    return (
      <div
        className="modal fade show d-block gst-notice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notice-modal-title"
        style={{
          backgroundColor:
            "rgba(15, 23, 42, 0.65)",
        }}
      >
        <div className="modal-dialog modal-dialog-centered modal-lg">

          <div className="modal-content">

            {/* HEADER */}

            <div className="gst-modal-header">

              <div className="d-flex align-items-center justify-content-between">

                <div className="d-flex align-items-center gap-2">

                  <ShieldAlert
                    size={20}
                    className="text-warning"
                  />

                  <div>
                    <h5
                      id="notice-modal-title"
                      className="gst-modal-title mb-0"
                    >
                      Dispatch Statutory Notice
                    </h5>

                    <div className="gst-modal-subtitle">
                      Return defaulter enforcement workflow
                    </div>
                  </div>

                </div>

                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={onClose}
                  disabled={submitting}
                  aria-label="Close"
                />

              </div>

            </div>

            {/* BODY */}

            <div className="gst-modal-body">

              <div className="row g-3 mb-3">

                <div className="col-md-6">
                  <div className="gst-modal-info-card">

                    <div className="gst-modal-info-label">
                      GSTIN
                    </div>

                    <div className="gst-modal-info-value font-monospace">
                      {record.gstin ||
                        "-"}
                    </div>

                  </div>
                </div>

                <div className="col-md-3">
                  <div className="gst-modal-info-card">

                    <div className="gst-modal-info-label">
                      Return Period
                    </div>

                    <div className="gst-modal-info-value">
                      {formatPeriodLabel(
                        period
                      )}
                    </div>

                  </div>
                </div>

                <div className="col-md-3">
                  <div className="gst-modal-info-card">

                    <div className="gst-modal-info-label">
                      Risk
                    </div>

                    <div className="mt-1">
                      <RiskBadge
                        category={
                          riskCategory
                        }
                        score={
                          riskScore
                        }
                      />
                    </div>

                  </div>
                </div>

              </div>

              <div className="row g-3 mb-3">

                <div className="col-md-4">
                  <div className="gst-modal-info-card">

                    <div className="gst-modal-info-label">
                      Filing Delay
                    </div>

                    <div className="gst-modal-info-value">
                      {formatNumber(
                        getDelayDays(
                          record
                        )
                      )}{" "}
                      days
                    </div>

                  </div>
                </div>

                <div className="col-md-4">
                  <div className="gst-modal-info-card">

                    <div className="gst-modal-info-label">
                      Taxable Value
                    </div>

                    <div className="gst-modal-info-value">
                      {formatCurrency(
                        record.taxableValue
                      )}
                    </div>

                  </div>
                </div>

                <div className="col-md-4">
                  <div className="gst-modal-info-card">

                    <div className="gst-modal-info-label">
                      Output Tax
                    </div>

                    <div className="gst-modal-info-value">
                      {formatCurrency(
                        record.totalOutputTax
                      )}
                    </div>

                  </div>
                </div>

              </div>

              <div className="mb-2">

                <label
                  htmlFor="notice-ground-reason"
                  className="form-label small fw-bold"
                >
                  Audit enforcement grounds
                </label>

                <textarea
                  id="notice-ground-reason"
                  rows={5}
                  className="form-control gst-modal-textarea"
                  value={reason}
                  onChange={(e) =>
                    setReason(
                      e.target.value
                    )
                  }
                  disabled={submitting}
                  maxLength={4000}
                />

                <div className="text-end text-muted small mt-1">
                  {reason.length}/4000
                </div>

              </div>

              <div className="alert alert-warning d-flex gap-2 align-items-start small mb-0">

                <AlertTriangle
                  size={17}
                  className="flex-shrink-0 mt-1"
                />

                <div>
                  Please verify the taxpayer,
                  return period and statutory
                  grounds before dispatching
                  the notice.
                </div>

              </div>

            </div>

            {/* FOOTER */}

            <div className="modal-footer bg-white px-4 py-3">

              <button
                type="button"
                className="btn btn-outline-secondary rounded-2"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn btn-primary rounded-2 d-flex align-items-center gap-2 px-4"
                disabled={
                  submitting ||
                  !reason.trim() ||
                  !record.gstin
                }
                onClick={() =>
                  onSubmit({
                    gstin:
                      record.gstin,

                    retPeriod:
                      record.retPeriod ||
                      retPeriod,

                    actionType:
                      getActionRequired(
                        record
                      ),

                    groundReason:
                      reason.trim(),
                  })
                }
              >
                {submitting ? (
                  <>
                    <Loader2
                      size={16}
                      className="spin"
                    />
                    Dispatching...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Issue Statutory Notice
                  </>
                )}
              </button>

            </div>

          </div>
        </div>
      </div>
    );
  }
);

/* =========================================================
   ADVANCED FILTER
========================================================= */

const AdvancedFilters = ({
  show,
  minRiskScore,
  setMinRiskScore,
  maxDelay,
  setMaxDelay,
  onReset,
}) => {
  if (!show) return null;

  return (
    <div className="gst-advanced-filter">

      <div className="row g-3 align-items-end">

        <div className="col-md-4">

          <label
            htmlFor="minimum-risk-score"
            className="gst-filter-label"
          >
            Minimum Risk Score
          </label>

          <input
            id="minimum-risk-score"
            type="number"
            min="0"
            max="100"
            step="1"
            className="form-control form-control-sm mt-1"
            value={minRiskScore}
            onChange={(e) =>
              setMinRiskScore(
                e.target.value
              )
            }
            placeholder="Example: 70"
          />

        </div>

        <div className="col-md-4">

          <label
            htmlFor="maximum-filing-delay"
            className="gst-filter-label"
          >
            Maximum Filing Delay
          </label>

          <input
            id="maximum-filing-delay"
            type="number"
            min="0"
            step="1"
            className="form-control form-control-sm mt-1"
            value={maxDelay}
            onChange={(e) =>
              setMaxDelay(
                e.target.value
              )
            }
            placeholder="Days"
          />

        </div>

        <div className="col-md-4">

          <button
            type="button"
            className="btn btn-sm btn-outline-danger w-100"
            onClick={onReset}
          >
            <FilterX
              size={14}
              className="me-1"
            />
            Reset Filters
          </button>

        </div>

      </div>

    </div>
  );
};

/* =========================================================
   TABLE ROW
========================================================= */

const DefaulterRow = React.memo(
  ({
    row,
    retPeriod,
    onNotice,
  }) => {
    const riskCategory =
      row._risk ||
      getRiskCategory(row);

    const delay =
      row._delay ??
      getDelayDays(row);

    const score =
      row._score ??
      getRiskScorePct(row);

    const action =
      row._action ||
      getActionRequired(row);

    return (
      <tr>

        {/* TAXPAYER */}

        <td className="gst-taxpayer-cell">

          <div className="gst-gstin">
            {row.gstin || "-"}
          </div>

          <div className="gst-period">
            {formatPeriodLabel(
              row.retPeriod ||
                retPeriod
            )}
          </div>

        </td>

        {/* DELAY */}

        <td className="text-center">
          <DelayBadge
            delay={delay}
          />
        </td>

        {/* TAXABLE VALUE */}

        <td className="text-end">

          <div className="gst-money">
            {formatCurrency(
              row.taxableValue
            )}
          </div>

          <div className="gst-cell-label">
            Taxable Value
          </div>

        </td>

        {/* OUTPUT TAX */}

        <td className="text-end">

          <div className="gst-money">
            {formatCurrency(
              row.totalOutputTax
            )}
          </div>

          <div className="gst-cell-label">
            Output Tax
          </div>

        </td>

        {/* STATUTORY ACTION */}

        <td className="text-center">
          <ActionBadge
            action={action}
          />
        </td>

        {/* RISK */}

        <td className="text-center">

          <RiskBadge
            category={
              riskCategory
            }
            score={score}
          />

        </td>

        {/* ACTION */}

        <td className="text-center">

          <button
            type="button"
            className="btn btn-sm btn-primary gst-notice-button d-inline-flex align-items-center justify-content-center gap-1"
            onClick={() =>
              onNotice(row)
            }
            disabled={!row.gstin}
            title={
              row.gstin
                ? "Issue statutory notice"
                : "GSTIN unavailable"
            }
          >
            <Send size={13} />
            Notice
          </button>

        </td>

      </tr>
    );
  }
);

/* =========================================================
   SKELETON
========================================================= */

const SkeletonRow = () => (
  <tr>

    <td>
      <span
        className="placeholder-glow d-inline-block"
        style={{ width: "70%" }}
      >
        <span
          className="placeholder col-12 rounded-1"
          style={{ height: 14 }}
        />
      </span>

      <span
        className="placeholder-glow d-inline-block mt-2"
        style={{ width: "45%" }}
      >
        <span
          className="placeholder col-12 rounded-1"
          style={{ height: 10 }}
        />
      </span>
    </td>

    <td className="text-center">
      <span
        className="placeholder-glow d-inline-block"
        style={{ width: 70 }}
      >
        <span
          className="placeholder col-12 rounded-pill"
          style={{ height: 22 }}
        />
      </span>
    </td>

    <td className="text-end">
      <span
        className="placeholder-glow d-inline-block"
        style={{ width: "65%" }}
      >
        <span
          className="placeholder col-12 rounded-1"
          style={{ height: 14 }}
        />
      </span>
    </td>

    <td className="text-end">
      <span
        className="placeholder-glow d-inline-block"
        style={{ width: "65%" }}
      >
        <span
          className="placeholder col-12 rounded-1"
          style={{ height: 14 }}
        />
      </span>
    </td>

    <td className="text-center">
      <span
        className="placeholder-glow d-inline-block"
        style={{ width: "80%" }}
      >
        <span
          className="placeholder col-12 rounded-pill"
          style={{ height: 22 }}
        />
      </span>
    </td>

    <td className="text-center">
      <span
        className="placeholder-glow d-inline-block"
        style={{ width: 90 }}
      >
        <span
          className="placeholder col-12 rounded-pill"
          style={{ height: 22 }}
        />
      </span>
    </td>

    <td className="text-center">
      <span
        className="placeholder-glow d-inline-block"
        style={{ width: 80 }}
      >
        <span
          className="placeholder col-12 rounded-2"
          style={{ height: 30 }}
        />
      </span>
    </td>

  </tr>
);

/* =========================================================
   TOP LOADING BAR
========================================================= */

const TopLoadingBar = ({
  active,
}) => {
  if (!active) return null;

  return (
    <div className="gst-top-loading">
      <div className="gst-top-loading-inner" />
    </div>
  );
};

/* =========================================================
   PAGINATION
========================================================= */

const buildPageWindow = (
  current,
  total
) => {
  if (total <= 0) return [];

  const pages = [];

  const windowSize = 1;

  const start = Math.max(
    1,
    current - windowSize
  );

  const end = Math.min(
    total,
    current + windowSize
  );

  if (start > 1) {
    pages.push(1);

    if (start > 2) {
      pages.push("ellipsis-start");
    }
  }

  for (
    let page = start;
    page <= end;
    page += 1
  ) {
    pages.push(page);
  }

  if (end < total) {
    if (end < total - 1) {
      pages.push("ellipsis-end");
    }

    pages.push(total);
  }

  return pages;
};

const PaginationBar =
  React.memo(
    ({
      pageNumber,
      totalPages,
      totalRecords,
      pageSize,
      onPageChange,
      onPageSizeChange,
      disabled,
    }) => {
      const currentPage =
        totalRecords === 0
          ? 0
          : pageNumber + 1;

      const rangeStart =
        totalRecords === 0
          ? 0
          : pageNumber *
              pageSize +
            1;

      const rangeEnd =
        totalRecords === 0
          ? 0
          : Math.min(
              (pageNumber + 1) *
                pageSize,
              totalRecords
            );

      const pageWindow =
        useMemo(
          () =>
            buildPageWindow(
              currentPage,
              totalPages
            ),
          [
            currentPage,
            totalPages,
          ]
        );

      return (
        <div className="d-flex flex-column flex-lg-row justify-content-between align-items-center gap-3">

          <div className="d-flex flex-wrap align-items-center gap-3">

            <div className="small text-muted">
              Showing{" "}
              <strong className="text-dark">
                {formatNumber(
                  rangeStart
                )}
              </strong>
              {"–"}
              <strong className="text-dark">
                {formatNumber(
                  rangeEnd
                )}
              </strong>{" "}
              of{" "}
              <strong className="text-dark">
                {formatNumber(
                  totalRecords
                )}
              </strong>{" "}
              records
            </div>

            <div className="d-flex align-items-center gap-2">

              <label
                className="small text-muted mb-0"
                htmlFor="defaulter-page-size"
              >
                Rows per page
              </label>

              <select
                id="defaulter-page-size"
                className="form-select form-select-sm"
                style={{ width: 80 }}
                value={pageSize}
                disabled={disabled}
                onChange={(e) =>
                  onPageSizeChange(
                    Number(
                      e.target.value
                    )
                  )
                }
              >
                {PAGE_SIZE_OPTIONS.map(
                  (size) => (
                    <option
                      key={size}
                      value={size}
                    >
                      {size}
                    </option>
                  )
                )}
              </select>

            </div>

          </div>

          {totalRecords > 0 && (
            <nav
              aria-label="Defaulter pagination"
              className="gst-pagination"
            >
              <ul className="pagination pagination-sm mb-0">

                {/* FIRST */}

                <li
                  className={`page-item ${
                    pageNumber === 0 ||
                    disabled
                      ? "disabled"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    className="page-link d-flex align-items-center"
                    aria-label="First page"
                    disabled={
                      pageNumber === 0 ||
                      disabled
                    }
                    onClick={() =>
                      onPageChange(0)
                    }
                  >
                    <ChevronsLeft
                      size={14}
                    />
                  </button>
                </li>

                {/* PREVIOUS */}

                <li
                  className={`page-item ${
                    pageNumber === 0 ||
                    disabled
                      ? "disabled"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    className="page-link d-flex align-items-center"
                    aria-label="Previous page"
                    disabled={
                      pageNumber === 0 ||
                      disabled
                    }
                    onClick={() =>
                      onPageChange(
                        Math.max(
                          0,
                          pageNumber -
                            1
                        )
                      )
                    }
                  >
                    <ChevronLeft
                      size={14}
                    />
                  </button>
                </li>

                {/* PAGES */}

                {pageWindow.map(
                  (page) =>
                    typeof page ===
                    "string" ? (
                      <li
                        className="page-item disabled"
                        key={page}
                      >
                        <span className="page-link">
                          …
                        </span>
                      </li>
                    ) : (
                      <li
                        className={`page-item ${
                          page ===
                          currentPage
                            ? "active"
                            : ""
                        }`}
                        key={page}
                      >
                        <button
                          type="button"
                          className="page-link"
                          disabled={
                            disabled
                          }
                          onClick={() =>
                            onPageChange(
                              page - 1
                            )
                          }
                        >
                          {page}
                        </button>
                      </li>
                    )
                )}

                {/* NEXT */}

                <li
                  className={`page-item ${
                    pageNumber >=
                      totalPages -
                        1 ||
                    disabled
                      ? "disabled"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    className="page-link d-flex align-items-center"
                    aria-label="Next page"
                    disabled={
                      pageNumber >=
                        totalPages -
                          1 ||
                      disabled
                    }
                    onClick={() =>
                      onPageChange(
                        Math.min(
                          totalPages -
                            1,
                          pageNumber +
                            1
                        )
                      )
                    }
                  >
                    <ChevronRight
                      size={14}
                    />
                  </button>
                </li>

                {/* LAST */}

                <li
                  className={`page-item ${
                    pageNumber >=
                      totalPages -
                        1 ||
                    disabled
                      ? "disabled"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    className="page-link d-flex align-items-center"
                    aria-label="Last page"
                    disabled={
                      pageNumber >=
                        totalPages -
                          1 ||
                      disabled
                    }
                    onClick={() =>
                      onPageChange(
                        totalPages -
                          1
                      )
                    }
                  >
                    <ChevronsRight
                      size={14}
                    />
                  </button>
                </li>

              </ul>
            </nav>
          )}

        </div>
      );
    }
  );

/* =========================================================
   MAIN DASHBOARD
========================================================= */

export default function GstReturnDefaulterDashboard() {

  /* -------------------------------------------------------
     PERIOD
  ------------------------------------------------------- */

  const [periods, setPeriods] =
    useState([]);

  const [selectedPeriod, setSelectedPeriod] =
    useState("");

  const [periodsLoading, setPeriodsLoading] =
    useState(false);

  /* -------------------------------------------------------
     DATA
  ------------------------------------------------------- */

  const [data, setData] =
    useState([]);

  const [summary, setSummary] =
    useState({
      totalQueue: 0,
      form3A: 0,
      critical: 0,
      high: 0,
    });

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState(null);

  /* -------------------------------------------------------
     FILTERS
  ------------------------------------------------------- */

  const [searchTerm, setSearchTerm] =
    useState("");

  const [riskFilter, setRiskFilter] =
    useState("ALL");

  const [showAdvanced, setShowAdvanced] =
    useState(false);

  const [minRiskScore, setMinRiskScore] =
    useState("");

  const [maxDelay, setMaxDelay] =
    useState("");

  /* -------------------------------------------------------
     PAGINATION
  ------------------------------------------------------- */

  const [pageNumber, setPageNumber] =
    useState(0);

  const [pageSize, setPageSize] =
    useState(DEFAULT_PAGE_SIZE);

  /* -------------------------------------------------------
     DEFERRED FILTERS
  ------------------------------------------------------- */

  const deferredSearchTerm =
    useDeferredValue(searchTerm);

  const deferredMinRiskScore =
    useDeferredValue(minRiskScore);

  const deferredMaxDelay =
    useDeferredValue(maxDelay);

  const isFilterPending =
    searchTerm !==
      deferredSearchTerm ||
    minRiskScore !==
      deferredMinRiskScore ||
    maxDelay !==
      deferredMaxDelay;

  /* -------------------------------------------------------
     NOTICE
  ------------------------------------------------------- */

  const [modalRecord, setModalRecord] =
    useState(null);

  const [
    submittingNotice,
    setSubmittingNotice,
  ] = useState(false);

  /* -------------------------------------------------------
     TOAST
  ------------------------------------------------------- */

  const [toast, setToast] =
    useState(null);

  /* -------------------------------------------------------
     REQUEST CONTROL
  ------------------------------------------------------- */

  const abortControllerRef =
    useRef(null);

  /* =======================================================
     LOAD PERIODS
  ======================================================= */

  useEffect(() => {
    let mounted = true;

    const loadPeriods = async () => {
      setPeriodsLoading(true);

      try {
        const response =
          await fetchAllReturnPeriods();

        if (!mounted) return;

        const list = Array.isArray(
          response
        )
          ? response
          : Array.isArray(
              response?.data
            )
          ? response.data
          : Array.isArray(
              response?.content
            )
          ? response.content
          : [];

        const normalized =
          list
            .map((item) => ({
              original: item,
              value:
                getPeriodValue(item),
            }))
            .filter(
              (item) =>
                item.value
            );

        setPeriods(
          normalized.map(
            (item) =>
              item.original
          )
        );

        if (
          normalized.length > 0
        ) {
          setSelectedPeriod(
            normalized[0].value
          );
        }
      } catch (err) {
        if (!mounted) return;

        console.error(
          "Failed to load return periods",
          err
        );

        setError(
          err?.response?.data
            ?.message ||
            err?.message ||
            "Unable to load return periods."
        );
      } finally {
        if (mounted) {
          setPeriodsLoading(false);
        }
      }
    };

    loadPeriods();

    return () => {
      mounted = false;
    };
  }, []);

  /* =======================================================
     FETCH DATA
  ======================================================= */

  const fetchAuditData =
    useCallback(
      async (period) => {
        if (!period) return;

        /*
         * Cancel previous request.
         */
        if (
          abortControllerRef.current
        ) {
          abortControllerRef.current.abort();
        }

        const controller =
          new AbortController();

        abortControllerRef.current =
          controller;

        setLoading(true);
        setError(null);

        try {
          /*
           * -------------------------------------------------
           * STEP 1: PROBE
           * -------------------------------------------------
           *
           * Ask backend for one row to obtain
           * totalElements.
           */
          const probe =
            await fetchReturnDefaulters({
              retPeriod: period,
              page: 0,
              size: 1,
              riskLevel: "ALL",
              signal:
                controller.signal,
            });

          if (
            controller.signal.aborted
          ) {
            return;
          }

          const reportedTotalRaw =
            probe?.totalElements ??
            probe?.totalCount ??
            probe?.total ??
            probe?.count;

          const reportedTotal =
            Number(
              reportedTotalRaw
            );

          const hasUsableTotal =
            Number.isFinite(
              reportedTotal
            ) &&
            reportedTotal >= 0;

          /*
           * -------------------------------------------------
           * STEP 2: FETCH DATA
           * -------------------------------------------------
           */

          let fetchSize;

          if (hasUsableTotal) {
            /*
             * Do not add unnecessary buffer if
             * backend already reports the total.
             */
            fetchSize =
              reportedTotal === 0
                ? 1
                : Math.min(
                    reportedTotal +
                      FETCH_SIZE_BUFFER,
                    FALLBACK_SERVER_FETCH_SIZE
                  );
          } else {
            fetchSize =
              FALLBACK_SERVER_FETCH_SIZE;
          }

          const result =
            await fetchReturnDefaulters({
              retPeriod: period,
              page: 0,
              size: fetchSize,
              riskLevel: "ALL",
              signal:
                controller.signal,
            });

          if (
            controller.signal.aborted
          ) {
            return;
          }

          /*
           * -------------------------------------------------
           * RESPONSE NORMALIZATION
           * -------------------------------------------------
           */

          const records =
            Array.isArray(
              result?.content
            )
              ? result.content
              : Array.isArray(
                  result?.records
                )
              ? result.records
              : Array.isArray(
                  result?.data
                )
              ? result.data
              : Array.isArray(result)
              ? result
              : [];

          const enriched =
            records.map(
              enrichRecord
            );

          /*
           * -------------------------------------------------
           * SUMMARY
           * -------------------------------------------------
           */

          const serverSummary =
            result?.summary ||
            result?.metrics ||
            result?.statistics ||
            probe?.summary ||
            probe?.metrics ||
            probe?.statistics ||
            {};

          /*
           * If backend total is available,
           * use it. Otherwise use actual fetched
           * records.
           */
          const totalQueue =
            hasUsableTotal
              ? reportedTotal
              : enriched.length;

          const calculatedForm3A =
            enriched.filter(
              (item) =>
                item._delay >= 30 &&
                item._delay < 90
            ).length;

          const calculatedCritical =
            enriched.filter(
              (item) =>
                item._delay >= 90 ||
                item._risk ===
                  "CRITICAL"
            ).length;

          const calculatedHigh =
            enriched.filter(
              (item) =>
                item._risk === "HIGH"
            ).length;

          const serverForm3A =
            Number(
              serverSummary.form3A ??
                serverSummary.formGst3A ??
                serverSummary.form3a
            );

          const serverCritical =
            Number(
              serverSummary.critical
            );

          const serverHigh =
            Number(
              serverSummary.high
            );

          setData(enriched);

          setSummary({
            totalQueue,

            form3A:
              Number.isFinite(
                serverForm3A
              )
                ? serverForm3A
                : calculatedForm3A,

            critical:
              Number.isFinite(
                serverCritical
              )
                ? serverCritical
                : calculatedCritical,

            high:
              Number.isFinite(
                serverHigh
              )
                ? serverHigh
                : calculatedHigh,
          });

          /*
           * If backend reports zero but returned
           * records, correct the total.
           */
          if (
            totalQueue === 0 &&
            enriched.length > 0
          ) {
            setSummary(
              (current) => ({
                ...current,
                totalQueue:
                  enriched.length,
              })
            );
          }

        } catch (err) {

          if (
            isAbortError(err)
          ) {
            return;
          }

          console.error(
            "Failed to fetch GST return defaulters",
            err
          );

          setError(
            err?.response?.data
              ?.message ||
              err?.message ||
              "Unable to load GST return defaulter data."
          );

          setData([]);

          setSummary({
            totalQueue: 0,
            form3A: 0,
            critical: 0,
            high: 0,
          });

        } finally {

          if (
            !controller.signal.aborted
          ) {
            setLoading(false);
          }
        }
      },
      []
    );

  /* =======================================================
     PERIOD CHANGE
  ======================================================= */

  useEffect(() => {
    if (!selectedPeriod) {
      return;
    }

    setPageNumber(0);

    fetchAuditData(
      selectedPeriod
    );

    return () => {
      if (
        abortControllerRef.current
      ) {
        abortControllerRef.current.abort();
      }
    };
  }, [
    selectedPeriod,
    fetchAuditData,
  ]);

  /* =======================================================
     CLIENT-SIDE FILTERING
  ======================================================= */

  const displayedRecords =
    useMemo(() => {
      const query =
        deferredSearchTerm
          .trim()
          .toLowerCase();

      const parsedMinScore =
        deferredMinRiskScore ===
        ""
          ? null
          : Number(
              deferredMinRiskScore
            );

      const minScore =
        Number.isFinite(
          parsedMinScore
        )
          ? Math.max(
              0,
              Math.min(
                100,
                parsedMinScore
              )
            )
          : null;

      const parsedMaxDelay =
        deferredMaxDelay === ""
          ? null
          : Number(
              deferredMaxDelay
            );

      const maxDelayValue =
        Number.isFinite(
          parsedMaxDelay
        )
          ? Math.max(
              0,
              parsedMaxDelay
            )
          : null;

      if (
        !query &&
        riskFilter === "ALL" &&
        minScore === null &&
        maxDelayValue === null
      ) {
        return data;
      }

      return data.filter(
        (row) => {

          /*
           * Search GSTIN or return period.
           */
          if (query) {
            const matches =
              row._gstinLower.includes(
                query
              ) ||
              row._periodLower.includes(
                query
              ) ||
              String(
                row.retPeriod || ""
              )
                .toLowerCase()
                .includes(query);

            if (!matches) {
              return false;
            }
          }

          /*
           * Risk.
           */
          if (
            riskFilter !== "ALL" &&
            row._risk !== riskFilter
          ) {
            return false;
          }

          /*
           * Minimum risk.
           */
          if (
            minScore !== null &&
            row._score < minScore
          ) {
            return false;
          }

          /*
           * Maximum delay.
           */
          if (
            maxDelayValue !== null &&
            row._delay >
              maxDelayValue
          ) {
            return false;
          }

          return true;
        }
      );
    }, [
      data,
      deferredSearchTerm,
      riskFilter,
      deferredMinRiskScore,
      deferredMaxDelay,
    ]);

  /* =======================================================
     PAGINATION
  ======================================================= */

  const totalElements =
    displayedRecords.length;

  const totalPages = Math.max(
    1,
    Math.ceil(
      totalElements / pageSize
    )
  );

  /*
   * Reset page when the actual deferred
   * filter changes.
   */
  useEffect(() => {
    setPageNumber(0);
  }, [
    deferredSearchTerm,
    riskFilter,
    deferredMinRiskScore,
    deferredMaxDelay,
    pageSize,
    selectedPeriod,
  ]);

  /*
   * Keep page within valid range.
   */
  useEffect(() => {
    setPageNumber(
      (current) =>
        Math.min(
          current,
          totalPages - 1
        )
    );
  }, [totalPages]);

  const paginatedRecords =
    useMemo(() => {
      const start =
        pageNumber * pageSize;

      return displayedRecords.slice(
        start,
        start + pageSize
      );
    }, [
      displayedRecords,
      pageNumber,
      pageSize,
    ]);

  /* =======================================================
     RESET FILTERS
  ======================================================= */

  const resetFilters =
    useCallback(() => {
      setSearchTerm("");
      setRiskFilter("ALL");
      setMinRiskScore("");
      setMaxDelay("");
      setPageNumber(0);
    }, []);

  /* =======================================================
     NOTICE
  ======================================================= */

  const openNotice =
    useCallback(
      (record) => {
        setModalRecord(record);
      },
      []
    );

  const closeNotice =
    useCallback(() => {
      if (
        submittingNotice
      ) {
        return;
      }

      setModalRecord(null);
    }, [submittingNotice]);

  const dispatchNotice =
    useCallback(
      async (payload) => {
        if (
          submittingNotice
        ) {
          return;
        }

        if (
          !payload?.gstin ||
          !payload?.retPeriod
        ) {
          setToast({
            type: "error",
            message:
              "GSTIN and return period are required.",
          });

          return;
        }

        setSubmittingNotice(
          true
        );

        try {
          await issueDefaulterNotice(
            payload
          );

          setModalRecord(null);

          setToast({
            type: "success",
            message:
              `Statutory notice successfully dispatched to ${payload.gstin}.`,
          });

          /*
           * Refresh current period so that
           * backend notice/status changes are
           * immediately reflected.
           */
          await fetchAuditData(
            selectedPeriod
          );

        } catch (err) {

          console.error(
            "Failed to issue statutory notice",
            err
          );

          setToast({
            type: "error",
            message:
              err?.response?.data
                ?.message ||
              err?.message ||
              "Unable to issue statutory notice.",
          });

        } finally {
          setSubmittingNotice(
            false
          );
        }
      },
      [
        submittingNotice,
        fetchAuditData,
        selectedPeriod,
      ]
    );

  /* =======================================================
     EXPORT
  ======================================================= */

  const handleExport =
    useCallback(() => {
      if (
        displayedRecords.length === 0
      ) {
        setToast({
          type: "error",
          message:
            "There are no records available for export.",
        });

        return;
      }

      const success =
        exportToCSV(
          displayedRecords,
          `GST_Defaulters_${selectedPeriod}.csv`
        );

      if (success) {
        setToast({
          type: "success",
          message:
            `${formatNumber(
              displayedRecords.length
            )} records exported successfully.`,
        });
      }
    }, [
      displayedRecords,
      selectedPeriod,
    ]);

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="gst-defaulter-dashboard">

      {/* ===================================================
          HEADER
      =================================================== */}

      <header className="gst-office-header">

        <div className="container-fluid px-3 px-lg-4">

          <div className="gst-header-inner d-flex flex-column flex-xl-row justify-content-between align-items-xl-center gap-3 py-3">

            <div className="d-flex align-items-center gap-3">

              <div className="gst-title-icon flex-shrink-0">
                <UserX size={21} />
              </div>

              <div className="min-w-0">

                <h1 className="gst-page-title text-truncate">
                  Filing Delay & Statutory Enforcement Monitoring
                </h1>

                <div className="gst-page-subtitle">
                  GST return defaulter monitoring,
                  risk assessment and statutory
                  enforcement
                </div>

              </div>

            </div>

            <div className="d-flex flex-wrap align-items-center gap-2">

              <SearchablePeriodSelect
                options={periods}
                value={selectedPeriod}
                loading={periodsLoading}
                onChange={(value) => {
                  setSelectedPeriod(
                    value
                  );

                  setPageNumber(0);
                }}
              />

              <button
                type="button"
                className="btn btn-outline-success rounded-2 d-flex align-items-center gap-2"
                disabled={
                  loading ||
                  displayedRecords.length ===
                    0
                }
                onClick={handleExport}
              >
                <Download size={15} />
                Export
              </button>

              <button
                type="button"
                className="btn btn-primary rounded-2 d-flex align-items-center gap-2"
                disabled={
                  loading ||
                  !selectedPeriod
                }
                onClick={() =>
                  fetchAuditData(
                    selectedPeriod
                  )
                }
              >
                <RefreshCw
                  size={15}
                  className={
                    loading
                      ? "spin"
                      : ""
                  }
                />
                Refresh
              </button>

            </div>

          </div>

        </div>

      </header>

      {/* ===================================================
          MAIN
      =================================================== */}

      <main className="container-fluid px-3 px-lg-4 gst-main-content">

        {/* ERROR */}

        {error && (
          <div className="alert alert-danger border-0 shadow-sm d-flex align-items-start gap-2 rounded-3">

            <AlertTriangle
              size={18}
              className="mt-1 flex-shrink-0"
            />

            <div className="flex-grow-1">

              <div className="fw-bold">
                Unable to load dashboard
              </div>

              <div className="small">
                {error}
              </div>

            </div>

            <button
              type="button"
              className="btn-close"
              onClick={() =>
                setError(null)
              }
              aria-label="Close error"
            />

          </div>
        )}

        {/* =================================================
    KPI GRID — GST RETURN DEFAULTER DASHBOARD
================================================= */}

<div className="px-2 px-sm-3 px-lg-4">
  <div className="row g-3 mb-4">

    {/* =================================================
        TOTAL DEFAULTERS
    ================================================= */}
    <div className="col-12 col-sm-6 col-xl-3">
      <KpiCard
        title="Total Defaulters"
        value={summary.totalQueue}
        subtitle="Return defaulters requiring monitoring"
        icon={UserX}
        variant="primary"
        loading={loading}
      />
    </div>

    {/* =================================================
        FORM GST 3A
    ================================================= */}
    <div className="col-12 col-sm-6 col-xl-3">
      <KpiCard
        title="Form GST 3A"
        value={summary.form3A}
        subtitle="30–89 days filing delay"
        icon={Clock3}
        variant="warning"
        loading={loading}
      />
    </div>

    {/* =================================================
        CRITICAL RISK
    ================================================= */}
    <div className="col-12 col-sm-6 col-xl-3">
      <KpiCard
        title="Critical Risk"
        value={summary.critical}
        subtitle="90+ days / critical risk"
        icon={ShieldAlert}
        variant="danger"
        loading={loading}
      />
    </div>

    {/* =================================================
        HIGH RISK
    ================================================= */}
    <div className="col-12 col-sm-6 col-xl-3">
      <KpiCard
        title="High Risk"
        value={summary.high}
        subtitle="Priority audit review"
        icon={AlertTriangle}
        variant="info"
        loading={loading}
      />
    </div>

  </div>
</div>



        {/* =================================================
            RISK DISTRIBUTION
        ================================================= */}

        <div className="gst-risk-card mb-4">

          <div className="p-3">

            <div className="d-flex flex-column flex-md-row align-items-md-center gap-3">

              <div className="gst-section-label">
                Risk Distribution
              </div>

              <div className="flex-grow-1">

                <div className="progress gst-risk-progress">

                  <div
                    className="progress-bar bg-danger"
                    style={{
                      width: `${
                        summary.totalQueue
                          ? Math.min(
                              100,
                              (summary.critical /
                                summary.totalQueue) *
                                100
                            )
                          : 0
                      }%`,
                    }}
                    title={`Critical: ${summary.critical}`}
                  />

                  <div
                    className="progress-bar bg-warning"
                    style={{
                      width: `${
                        summary.totalQueue
                          ? Math.min(
                              100,
                              (summary.high /
                                summary.totalQueue) *
                                100
                            )
                          : 0
                      }%`,
                    }}
                    title={`High: ${summary.high}`}
                  />

                  <div
                    className="progress-bar bg-info"
                    style={{
                      width: `${
                        summary.totalQueue
                          ? Math.min(
                              100,
                              (summary.form3A /
                                summary.totalQueue) *
                                100
                            )
                          : 0
                      }%`,
                    }}
                    title={`Form GST 3A: ${summary.form3A}`}
                  />

                </div>

              </div>

              <div className="d-flex flex-wrap gap-3">

                <span className="gst-risk-stat">
                  <span
                    className="gst-risk-dot"
                    style={{
                      background:
                        "#dc3545",
                    }}
                  />

                  <strong className="text-danger">
                    {formatNumber(
                      summary.critical
                    )}
                  </strong>

                  Critical
                </span>

                <span className="gst-risk-stat">
                  <span
                    className="gst-risk-dot"
                    style={{
                      background:
                        "#f59e0b",
                    }}
                  />

                  <strong className="text-warning-emphasis">
                    {formatNumber(
                      summary.high
                    )}
                  </strong>

                  High
                </span>

                <span className="gst-risk-stat">
                  <span
                    className="gst-risk-dot"
                    style={{
                      background:
                        "#0dcaf0",
                    }}
                  />

                  <strong className="text-info-emphasis">
                    {formatNumber(
                      summary.form3A
                    )}
                  </strong>

                  Form 3A
                </span>

              </div>

            </div>

          </div>

        </div>

        {/* =================================================
            DEFAULTER QUEUE
        ================================================= */}

        <section className="gst-office-card overflow-hidden">

          {/* TOOLBAR */}

          <div className="gst-toolbar">

            <div className="d-flex flex-column flex-xl-row justify-content-between align-items-xl-center gap-3">

              <div>

                <div className="gst-toolbar-title">
                  Return Defaulter Monitoring
                </div>

                <div className="gst-toolbar-subtitle">
                  Taxpayers requiring filing
                  compliance review and
                  statutory action
                </div>

              </div>

              <div className="d-flex flex-wrap align-items-center gap-2">

                {/* SEARCH */}

                <div className="input-group input-group-sm gst-search">

                  <span className="input-group-text">
                    <Search
                      size={14}
                      className="text-muted"
                    />
                  </span>

                  <input
                    type="search"
                    className="form-control"
                    placeholder="Search GSTIN or period..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(
                        e.target.value
                      );
                    }}
                  />

                  {searchTerm && (
                    <button
                      type="button"
                      className="btn btn-light border"
                      onClick={() =>
                        setSearchTerm("")
                      }
                      aria-label="Clear search"
                    >
                      <X size={13} />
                    </button>
                  )}

                </div>

                {/* RISK */}

                <select
                  className="form-select form-select-sm gst-filter-select"
                  value={riskFilter}
                  onChange={(e) => {
                    setRiskFilter(
                      e.target.value
                    );
                  }}
                  aria-label="Risk level filter"
                >
                  <option value="ALL">
                    All Risk Levels
                  </option>

                  <option value="CRITICAL">
                    Critical
                  </option>

                  <option value="HIGH">
                    High
                  </option>

                  <option value="MEDIUM">
                    Medium
                  </option>

                  <option value="LOW">
                    Low
                  </option>
                </select>

                {/* ADVANCED */}

                <button
                  type="button"
                  className={`btn btn-sm d-flex align-items-center gap-1 ${
                    showAdvanced
                      ? "btn-primary"
                      : "btn-outline-secondary"
                  }`}
                  onClick={() =>
                    setShowAdvanced(
                      (prev) =>
                        !prev
                    )
                  }
                >
                  <SlidersHorizontal
                    size={14}
                  />

                  Filters
                </button>

                {isFilterPending && (
                  <span className="small text-primary d-flex align-items-center gap-1">
                    <Loader2
                      size={13}
                      className="spin"
                    />
                    Filtering...
                  </span>
                )}

              </div>

            </div>

          </div>

          {/* LOADING */}

          <TopLoadingBar
            active={loading}
          />

          {/* ADVANCED FILTER */}

          <AdvancedFilters
            show={showAdvanced}
            minRiskScore={
              minRiskScore
            }
            setMinRiskScore={
              setMinRiskScore
            }
            maxDelay={
              maxDelay
            }
            setMaxDelay={
              setMaxDelay
            }
            onReset={
              resetFilters
            }
          />

          {/* ACTIVE FILTERS */}

          {(searchTerm ||
            riskFilter !==
              "ALL" ||
            minRiskScore ||
            maxDelay) && (
            <div className="gst-active-filter-bar d-flex flex-wrap align-items-center gap-2">

              <span className="small fw-bold text-muted">
                Active filters:
              </span>

              {searchTerm && (
                <span className="gst-filter-chip">
                  GSTIN/Period:{" "}
                  {searchTerm}
                </span>
              )}

              {riskFilter !==
                "ALL" && (
                <span className="gst-filter-chip">
                  Risk:{" "}
                  {riskFilter}
                </span>
              )}

              {minRiskScore && (
                <span className="gst-filter-chip">
                  Risk ≥{" "}
                  {minRiskScore}%
                </span>
              )}

              {maxDelay && (
                <span className="gst-filter-chip">
                  Delay ≤{" "}
                  {maxDelay} days
                </span>
              )}

              <button
                type="button"
                className="btn btn-link btn-sm text-danger p-0 ms-1"
                onClick={
                  resetFilters
                }
              >
                Clear all
              </button>

            </div>
          )}

          {/* TABLE */}

          <div className="gst-table-wrapper">

            <table className="table gst-office-table align-middle">

              <thead>

                <tr>

                  <th className="text-start">
                    Taxpayer
                  </th>

                  <th className="text-center">
                    Filing Delay
                  </th>

                  <th className="text-end">
                    Taxable Value
                  </th>

                  <th className="text-end">
                    Output Tax
                  </th>

                  <th className="text-center">
                    Statutory Action
                  </th>

                  <th className="text-center">
                    Risk Tier
                  </th>

                  <th className="text-center">
                    Action
                  </th>

                </tr>

              </thead>

              <tbody>

                {loading ? (
                  Array.from({
                    length: pageSize,
                  }).map(
                    (_, index) => (
                      <SkeletonRow
                        key={`skeleton-${index}`}
                      />
                    )
                  )
                ) : displayedRecords.length ===
                  0 ? (

                  <tr>

                    <td
                      colSpan={7}
                      className="py-5"
                    >

                      <div className="gst-empty-state">

                        <div className="gst-empty-icon mb-3">
                          <FilterX
                            size={26}
                          />
                        </div>

                        <div className="gst-empty-title">
                          No matching return
                          defaulters found
                        </div>

                        <div className="gst-empty-text">
                          Try changing the
                          period or filters.
                        </div>

                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary mt-3"
                          onClick={
                            resetFilters
                          }
                        >
                          Reset filters
                        </button>

                      </div>

                    </td>

                  </tr>

                ) : (

                  paginatedRecords.map(
                    (row, index) => (
                      <DefaulterRow
                        key={`${row.gstin || "unknown"}-${
                          row.retPeriod ||
                          selectedPeriod
                        }-${index}`}
                        row={row}
                        retPeriod={
                          selectedPeriod
                        }
                        onNotice={
                          openNotice
                        }
                      />
                    )
                  )

                )}

              </tbody>

            </table>

          </div>

          {/* PAGINATION */}

          <div className="gst-table-footer">

            <PaginationBar
              pageNumber={
                pageNumber
              }
              totalPages={
                totalPages
              }
              totalRecords={
                totalElements
              }
              pageSize={
                pageSize
              }
              disabled={
                loading ||
                isFilterPending
              }
              onPageChange={(
                page
              ) => {
                setPageNumber(
                  Math.max(
                    0,
                    Math.min(
                      page,
                      totalPages -
                        1
                    )
                  )
                );
              }}
              onPageSizeChange={(
                size
              ) => {
                const safeSize =
                  PAGE_SIZE_OPTIONS.includes(
                    size
                  )
                    ? size
                    : DEFAULT_PAGE_SIZE;

                setPageSize(
                  safeSize
                );

                setPageNumber(0);
              }}
            />

          </div>

        </section>

      </main>

      {/* ===================================================
          NOTICE MODAL
      =================================================== */}

      <NoticeModal
        show={Boolean(
          modalRecord
        )}
        record={modalRecord}
        retPeriod={
          selectedPeriod
        }
        onClose={
          closeNotice
        }
        onSubmit={
          dispatchNotice
        }
        submitting={
          submittingNotice
        }
      />

      {/* ===================================================
          TOAST
      =================================================== */}

      <Toast
        toast={toast}
        onClose={() =>
          setToast(null)
        }
      />

    </div>
  );
}