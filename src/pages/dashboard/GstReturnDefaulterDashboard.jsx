import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
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

const FALLBACK_SERVER_FETCH_SIZE = 750000;

const FETCH_SIZE_BUFFER = 200;

const MAX_RISK_SCORE = 100;

/* =========================================================
   RISK CONFIGURATION
========================================================= */

const RISK_CONFIG = {
  CRITICAL: {
    label: "Critical",
    className: "risk-critical",
    color: "danger",
  },

  HIGH: {
    label: "High",
    className: "risk-high",
    color: "warning",
  },

  MEDIUM: {
    label: "Medium",
    className: "risk-medium",
    color: "info",
  },

  LOW: {
    label: "Low",
    className: "risk-low",
    color: "success",
  },
};

/* =========================================================
   DELAY CONFIGURATION
========================================================= */

const DELAY_CONFIG = {
  CRITICAL: {
    label: "Critical Delay",
    className: "delay-critical",
  },

  WARNING: {
    label: "Delayed",
    className: "delay-warning",
  },

  NORMAL: {
    label: "Normal",
    className: "delay-normal",
  },
};

/* =========================================================
   HELPERS
========================================================= */

const isAbortError = (error) =>
  error?.name === "AbortError" ||
  error?.name === "CanceledError" ||
  error?.code === "ERR_CANCELED";

const toSafeNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const formatNumber = (value) =>
  new Intl.NumberFormat("en-IN").format(
    toSafeNumber(value)
  );

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(toSafeNumber(value));

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
      period.returnPeriod ??
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

  if (!/^\d{6}$/.test(value)) {
    return value;
  }

  const month = Number(value.substring(0, 2));
  const year = Number(value.substring(2, 6));

  if (
    month < 1 ||
    month > 12 ||
    !Number.isInteger(year)
  ) {
    return value;
  }

  return new Date(year, month - 1, 1).toLocaleString(
    "en-IN",
    {
      month: "short",
      year: "numeric",
    }
  );
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
    raw === null ||
    raw === undefined ||
    raw === ""
  ) {
    return null;
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    return null;
  }

  const percentage =
    value <= 1 ? value * 100 : value;

  return Math.min(
    MAX_RISK_SCORE,
    Math.max(0, percentage)
  );
};

const getDelayDays = (row) =>
  Math.max(
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

const getDelayTier = (delay) => {
  if (delay >= 90) {
    return "CRITICAL";
  }

  if (delay >= 30) {
    return "WARNING";
  }

  return "NORMAL";
};

const getActionRequired = (row) => {
  const action =
    row?.statutoryActionRequired ??
    row?.actionRequired ??
    row?.statutoryAction ??
    "Under Audit Scrutiny";

  return (
    String(action).trim() ||
    "Under Audit Scrutiny"
  );
};

/* =========================================================
   RECORD ENRICHMENT
========================================================= */

const enrichRecord = (row) => {
  const safeRow =
    row && typeof row === "object"
      ? row
      : {};

  const gstin = String(
    safeRow?.gstin ??
    safeRow?.GSTIN ??
    ""
  ).trim();

  const period = getPeriodValue(
    safeRow?.retPeriod ??
    safeRow?.returnPeriod ??
    ""
  );

  const risk = getRiskCategory(safeRow);

  const score = getRiskScorePct(safeRow);

  const delay = getDelayDays(safeRow);

  const action = getActionRequired(safeRow);

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
   NOTICE REASON
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

const csvEscape = (value) =>
  `"${String(value ?? "")
    .replace(/"/g, '""')
    .replace(/\r?\n|\r/g, " ")}"`;

const exportToCSV = (
  data,
  filename
) => {
  if (
    !Array.isArray(data) ||
    data.length === 0
  ) {
    return false;
  }

  const headers = [
    "Sl No",
    "GSTIN",
    "Return Period",
    "Filing Delay (Days)",
    "Taxable Value (INR)",
    "Total Output Tax (INR)",
    "Statutory Action Required",
    "Risk Level",
    "Risk Score (%)",
  ];

  const rows = data.map(
    (row, index) => [
      index + 1,
      csvEscape(row.gstin),
      csvEscape(
        formatPeriodLabel(row.retPeriod)
      ),
      getDelayDays(row),
      toSafeNumber(row.taxableValue),
      toSafeNumber(row.totalOutputTax),
      csvEscape(
        getActionRequired(row)
      ),
      csvEscape(
        getRiskCategory(row)
      ),
      getRiskScorePct(row) ?? 0,
    ]
  );

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      row.join(",")
    ),
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
  link.download =
    filename ||
    "GST_Defaulters.csv";

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
    if (!toast) {
      return null;
    }

    const error =
      toast.type === "error";

    return (
      <div className="gst-toast-container">
        <div
          className={`gst-toast ${error
            ? "gst-toast-error"
            : "gst-toast-success"
            }`}
          role="alert"
        >
          <div className="gst-toast-icon">
            {error ? (
              <AlertCircle size={19} />
            ) : (
              <CheckCircle2 size={19} />
            )}
          </div>

          <div className="gst-toast-content">
            <div className="gst-toast-title">
              {error
                ? "Operation Failed"
                : "Success"}
            </div>

            <div className="gst-toast-message">
              {toast.message}
            </div>
          </div>

          <button
            type="button"
            className="gst-toast-close"
            onClick={onClose}
            aria-label="Close notification"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    );
  }
);

/* =========================================================
   PERIOD SELECT
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
            search
              .trim()
              .toLowerCase();

          if (!query) {
            return options;
          }

          return options.filter(
            (item) =>
              getPeriodValue(item)
                .toLowerCase()
                .includes(query) ||
              formatPeriodLabel(item)
                .toLowerCase()
                .includes(query)
          );
        }, [options, search]);

      return (
        <div
          ref={containerRef}
          className="gst-period-control"
        >
          <button
            type="button"
            disabled={loading}
            className="gst-period-button"
            onClick={() =>
              setOpen(
                (previous) =>
                  !previous
              )
            }
          >
            <span className="gst-period-button-left">
              <Calendar size={15} />

              <span>
                {loading
                  ? "Loading..."
                  : selectedLabel}
              </span>
            </span>

            {loading ? (
              <Loader2
                size={15}
                className="spin"
              />
            ) : (
              <ChevronDown
                size={15}
                className={
                  open
                    ? "gst-chevron-open"
                    : ""
                }
              />
            )}
          </button>

          {open && !loading && (
            <div className="gst-period-menu">
              <div className="gst-period-search">
                <Search size={14} />

                <input
                  autoFocus
                  type="text"
                  placeholder="Search period..."
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value
                    )
                  }
                />
              </div>

              <div className="gst-period-list">
                {filteredOptions.length ===
                  0 ? (
                  <div className="gst-period-empty">
                    No period found
                  </div>
                ) : (
                  filteredOptions.map(
                    (item, index) => {
                      const period =
                        getPeriodValue(
                          item
                        );

                      const selected =
                        period === value;

                      return (
                        <button
                          type="button"
                          key={
                            period ||
                            `period-${index}`
                          }
                          className={`gst-period-option ${selected
                            ? "selected"
                            : ""
                            }`}
                          onClick={() => {
                            onChange(
                              period
                            );
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
    variant,
    loading,
  }) => (
    <div
      className={`gst-audit-kpi gst-audit-kpi-${variant}`}
    >
      <div className="gst-audit-kpi-main">
        <div className="gst-audit-kpi-label">
          {title}
        </div>

        <div className="gst-audit-kpi-value">
          {loading ? (
            <span className="gst-kpi-loading">
              Loading...
            </span>
          ) : (
            formatNumber(value)
          )}
        </div>

        <div className="gst-audit-kpi-subtitle">
          {subtitle}
        </div>
      </div>

      <div className="gst-audit-kpi-icon">
        <Icon size={21} />
      </div>
    </div>
  )
);

/* =========================================================
   RISK BADGE
========================================================= */

const RiskBadge = ({
  category,
  score,
}) => {
  const config =
    RISK_CONFIG[category] ||
    RISK_CONFIG.MEDIUM;

  return (
    <div className="gst-risk-wrapper">
      <span
        className={`gst-risk-badge ${config.className}`}
      >
        {config.label}
      </span>

      {score !== null &&
        score !== undefined && (
          <span className="gst-risk-score">
            {score.toFixed(0)}%
          </span>
        )}
    </div>
  );
};

/* =========================================================
   DELAY BADGE
========================================================= */

const DelayBadge = ({
  delay,
}) => {
  const tier =
    getDelayTier(delay);

  const config =
    DELAY_CONFIG[tier];

  return (
    <span
      className={`gst-delay-badge ${config.className}`}
    >
      <Clock3 size={12} />

      <span>
        {formatNumber(delay)}
      </span>

      <span>days</span>
    </span>
  );
};

/* =========================================================
   ACTION BADGE
========================================================= */

const ActionBadge = ({
  action,
}) => {
  const safeAction =
    String(action || "").trim() ||
    "Under Audit Scrutiny";

  const upper =
    safeAction.toUpperCase();

  let className =
    "gst-action-default";

  if (
    upper.includes("REG-17")
  ) {
    className =
      "gst-action-danger";
  } else if (
    upper.includes("3A")
  ) {
    className =
      "gst-action-warning";
  }

  return (
    <span
      className={`gst-action-badge ${className}`}
      title={safeAction}
    >
      <FileText size={12} />

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

    const risk =
      getRiskCategory(record);

    const score =
      getRiskScorePct(record);

    const period =
      record.retPeriod ||
      retPeriod;

    return (
      <div
        className="gst-modal-backdrop"
        role="dialog"
        aria-modal="true"
      >
        <div className="gst-notice-modal">
          <div className="gst-notice-header">
            <div className="gst-notice-heading">
              <div className="gst-notice-icon">
                <ShieldAlert size={20} />
              </div>

              <div>
                <div className="gst-notice-title">
                  Dispatch Statutory Notice
                </div>

                <div className="gst-notice-subtitle">
                  Return defaulter enforcement workflow
                </div>
              </div>
            </div>

            <button
              type="button"
              className="gst-modal-close"
              onClick={onClose}
              disabled={submitting}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div className="gst-notice-body">
            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <div className="gst-modal-info">
                  <div className="gst-modal-label">
                    GSTIN
                  </div>

                  <div className="gst-modal-value gst-mono">
                    {record.gstin || "-"}
                  </div>
                </div>
              </div>

              <div className="col-md-3">
                <div className="gst-modal-info">
                  <div className="gst-modal-label">
                    Return Period
                  </div>

                  <div className="gst-modal-value">
                    {formatPeriodLabel(
                      period
                    )}
                  </div>
                </div>
              </div>

              <div className="col-md-3">
                <div className="gst-modal-info">
                  <div className="gst-modal-label">
                    Risk
                  </div>

                  <RiskBadge
                    category={risk}
                    score={score}
                  />
                </div>
              </div>
            </div>

            <div className="row g-3 mb-3">
              <div className="col-md-4">
                <div className="gst-modal-info">
                  <div className="gst-modal-label">
                    Filing Delay
                  </div>

                  <div className="gst-modal-value">
                    {formatNumber(
                      getDelayDays(record)
                    )}{" "}
                    days
                  </div>
                </div>
              </div>

              <div className="col-md-4">
                <div className="gst-modal-info">
                  <div className="gst-modal-label">
                    Taxable Value
                  </div>

                  <div className="gst-modal-value">
                    {formatCurrency(
                      record.taxableValue
                    )}
                  </div>
                </div>
              </div>

              <div className="col-md-4">
                <div className="gst-modal-info">
                  <div className="gst-modal-label">
                    Output Tax
                  </div>

                  <div className="gst-modal-value">
                    {formatCurrency(
                      record.totalOutputTax
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="notice-ground-reason"
                className="gst-modal-form-label"
              >
                Audit enforcement grounds
              </label>

              <textarea
                id="notice-ground-reason"
                className="gst-modal-textarea"
                rows={5}
                maxLength={4000}
                value={reason}
                disabled={submitting}
                onChange={(event) =>
                  setReason(
                    event.target.value
                  )
                }
              />

              <div className="gst-character-count">
                {reason.length}/4000
              </div>
            </div>

            <div className="gst-notice-warning">
              <AlertTriangle size={17} />

              <span>
                Please verify the taxpayer,
                return period and statutory
                grounds before dispatching
                the notice.
              </span>
            </div>
          </div>

          <div className="gst-notice-footer">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>

            <button
              type="button"
              className="btn btn-primary d-flex align-items-center gap-2"
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
  if (!show) {
    return null;
  }

  return (
    <div className="gst-advanced-panel">
      <div className="gst-advanced-title">
        <SlidersHorizontal size={15} />

        Advanced Screening Filters
      </div>

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
            className="form-control form-control-sm"
            value={minRiskScore}
            onChange={(event) =>
              setMinRiskScore(
                event.target.value
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
            className="form-control form-control-sm"
            value={maxDelay}
            onChange={(event) =>
              setMaxDelay(
                event.target.value
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
    serialNumber,
    retPeriod,
    onNotice,
  }) => {
    const risk =
      row._risk ||
      getRiskCategory(row);

    const score =
      getRiskScorePct(row);

    const delay =
      row._delay ??
      getDelayDays(row);

    const action =
      row._action ||
      getActionRequired(row);

    return (
      <tr>
        {/* SERIAL */}
        <td className="gst-serial-cell">
          {formatNumber(
            serialNumber
          )}
        </td>

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

        {/* FILING DELAY */}
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
        </td>

        {/* OUTPUT TAX */}
        <td className="text-end">
          <div className="gst-money">
            {formatCurrency(
              row.totalOutputTax
            )}
          </div>
        </td>

        {/* ACTION */}
        <td className="text-center">
          <ActionBadge
            action={action}
          />
        </td>

        {/* RISK */}
        <td className="text-center">
          <RiskBadge
            category={risk}
            score={score}
          />
        </td>

        {/* NOTICE */}
        <td className="text-center">
          <button
            type="button"
            className="gst-notice-button"
            disabled={!row.gstin}
            onClick={() =>
              onNotice(row)
            }
            title={
              row.gstin
                ? "Issue statutory notice"
                : "GSTIN unavailable"
            }
          >
            <Send size={13} />

            <span>
              Notice
            </span>
          </button>
        </td>
      </tr>
    );
  }
);

/* =========================================================
   SKELETON ROW
========================================================= */

const SkeletonRow = () => (
  <tr>
    {Array.from({
      length: 8,
    }).map((_, index) => (
      <td
        key={index}
        className={
          index === 0
            ? "text-center"
            : index === 2 ||
              index === 5 ||
              index === 6 ||
              index === 7
              ? "text-center"
              : index === 3 ||
                index === 4
                ? "text-end"
                : ""
        }
      >
        <span className="gst-skeleton-line" />
      </td>
    ))}
  </tr>
);

/* =========================================================
   LOADING BAR
========================================================= */

const TopLoadingBar = ({
  active,
}) => {
  if (!active) {
    return null;
  }

  return (
    <div className="gst-loading-bar">
      <div />
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
  if (total <= 0) {
    return [];
  }

  const pages = [];

  const start = Math.max(
    1,
    current - 1
  );

  const end = Math.min(
    total,
    current + 1
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

      const pages =
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
        <div className="gst-pagination-footer">
          <div className="gst-pagination-info">
            Showing{" "}
            <strong>
              {formatNumber(
                rangeStart
              )}
            </strong>
            –
            <strong>
              {formatNumber(
                rangeEnd
              )}
            </strong>{" "}
            of{" "}
            <strong>
              {formatNumber(
                totalRecords
              )}
            </strong>{" "}
            records
          </div>

          <div className="gst-pagination-right">
            <div className="gst-page-size">
              <span>
                Rows per page
              </span>

              <select
                value={pageSize}
                disabled={disabled}
                onChange={(event) =>
                  onPageSizeChange(
                    Number(
                      event.target.value
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

            {totalRecords > 0 && (
              <nav>
                <ul className="pagination pagination-sm mb-0">
                  <li
                    className={`page-item ${pageNumber ===
                      0 ||
                      disabled
                      ? "disabled"
                      : ""
                      }`}
                  >
                    <button
                      type="button"
                      className="page-link"
                      disabled={
                        pageNumber ===
                        0 ||
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

                  <li
                    className={`page-item ${pageNumber ===
                      0 ||
                      disabled
                      ? "disabled"
                      : ""
                      }`}
                  >
                    <button
                      type="button"
                      className="page-link"
                      disabled={
                        pageNumber ===
                        0 ||
                        disabled
                      }
                      onClick={() =>
                        onPageChange(
                          pageNumber -
                          1
                        )
                      }
                    >
                      <ChevronLeft
                        size={14}
                      />
                    </button>
                  </li>

                  {pages.map(
                    (page) =>
                      typeof page ===
                        "string" ? (
                        <li
                          key={page}
                          className="page-item disabled"
                        >
                          <span className="page-link">
                            …
                          </span>
                        </li>
                      ) : (
                        <li
                          key={page}
                          className={`page-item ${page ===
                            currentPage
                            ? "active"
                            : ""
                            }`}
                        >
                          <button
                            type="button"
                            className="page-link"
                            disabled={
                              disabled
                            }
                            onClick={() =>
                              onPageChange(
                                page -
                                1
                              )
                            }
                          >
                            {page}
                          </button>
                        </li>
                      )
                  )}

                  <li
                    className={`page-item ${pageNumber >=
                      totalPages -
                      1 ||
                      disabled
                      ? "disabled"
                      : ""
                      }`}
                  >
                    <button
                      type="button"
                      className="page-link"
                      disabled={
                        pageNumber >=
                        totalPages -
                        1 ||
                        disabled
                      }
                      onClick={() =>
                        onPageChange(
                          pageNumber +
                          1
                        )
                      }
                    >
                      <ChevronRight
                        size={14}
                      />
                    </button>
                  </li>

                  <li
                    className={`page-item ${pageNumber >=
                      totalPages -
                      1 ||
                      disabled
                      ? "disabled"
                      : ""
                      }`}
                  >
                    <button
                      type="button"
                      className="page-link"
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
        </div>
      );
    }
  );

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function GstReturnDefaulterDashboard() {
  const [periods, setPeriods] =
    useState([]);

  const [selectedPeriod, setSelectedPeriod] =
    useState("");

  const [periodsLoading, setPeriodsLoading] =
    useState(false);

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

  const [pageNumber, setPageNumber] =
    useState(0);

  const [pageSize, setPageSize] =
    useState(DEFAULT_PAGE_SIZE);

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

  const [modalRecord, setModalRecord] =
    useState(null);

  const [
    submittingNotice,
    setSubmittingNotice,
  ] = useState(false);

  const [toast, setToast] =
    useState(null);

  const abortControllerRef =
    useRef(null);

  /* =======================================================
     LOAD PERIODS
  ======================================================= */

  useEffect(() => {
    let mounted = true;

    const loadPeriods = async () => {
      setPeriodsLoading(true);
      setError(null);

      try {
        const response =
          await fetchAllReturnPeriods();

        if (!mounted) {
          return;
        }

        const list =
          Array.isArray(response)
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

        const normalized = list
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
        if (!mounted) {
          return;
        }

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
        if (!period) {
          return;
        }

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

          const fetchSize =
            hasUsableTotal
              ? reportedTotal ===
                0
                ? 1
                : Math.min(
                  reportedTotal +
                  FETCH_SIZE_BUFFER,
                  FALLBACK_SERVER_FETCH_SIZE
                )
              : FALLBACK_SERVER_FETCH_SIZE;

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
                  : Array.isArray(
                    result
                  )
                    ? result
                    : [];

          const enriched =
            records.map(
              enrichRecord
            );

          const serverSummary =
            result?.summary ||
            result?.metrics ||
            result?.statistics ||
            probe?.summary ||
            probe?.metrics ||
            probe?.statistics ||
            {};

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
                item._risk ===
                "HIGH"
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
            totalQueue:
              totalQueue ||
              enriched.length,

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
            !controller.signal
              .aborted
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
      abortControllerRef.current?.abort();
    };
  }, [
    selectedPeriod,
    fetchAuditData,
  ]);

  /* =======================================================
     FILTER
  ======================================================= */

  const displayedRecords =
    useMemo(() => {
      const query =
        deferredSearchTerm
          .trim()
          .toLowerCase();

      const parsedMin =
        deferredMinRiskScore ===
          ""
          ? null
          : Number(
            deferredMinRiskScore
          );

      const minScore =
        Number.isFinite(
          parsedMin
        )
          ? Math.max(
            0,
            Math.min(
              100,
              parsedMin
            )
          )
          : null;

      const parsedMax =
        deferredMaxDelay ===
          ""
          ? null
          : Number(
            deferredMaxDelay
          );

      const maxDelayValue =
        Number.isFinite(
          parsedMax
        )
          ? Math.max(
            0,
            parsedMax
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

          if (
            riskFilter !== "ALL" &&
            row._risk !==
            riskFilter
          ) {
            return false;
          }

          if (
            minScore !== null &&
            row._score <
            minScore
          ) {
            return false;
          }

          if (
            maxDelayValue !==
            null &&
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
      totalElements /
      pageSize
    )
  );

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
        pageNumber *
        pageSize;

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
     RESET
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
    }, [
      submittingNotice,
    ]);

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
        displayedRecords.length ===
        0
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
     RISK DISTRIBUTION
  ======================================================= */

  const criticalPct =
    summary.totalQueue > 0
      ? Math.min(
        100,
        (summary.critical /
          summary.totalQueue) *
        100
      )
      : 0;

  const highPct =
    summary.totalQueue > 0
      ? Math.min(
        100,
        (summary.high /
          summary.totalQueue) *
        100
      )
      : 0;

  const form3APct =
    summary.totalQueue > 0
      ? Math.min(
        100,
        (summary.form3A /
          summary.totalQueue) *
        100
      )
      : 0;

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="gst-defaulter-dashboard min-vh-100">
      {/* =================================================
    OFFICE HEADER
================================================= */}

      <header className="gst-office-header bg-white border-bottom">
        <div className="container-fluid px-3 px-lg-4 py-3">
          <div className="d-flex flex-column flex-xl-row justify-content-between align-items-start align-items-xl-center gap-3">
            <div>
              <div className="d-flex align-items-center gap-2">
                <div className="gst-header-icon">
                  <UserX size={20} />
                </div>
                <div>
                  <h5 className="fw-bold text-dark mb-0 text-truncate">
                    Filing Delay & Statutory Enforcement Monitoring
                  </h5>
                </div>
              </div>
            </div>

            <div className="d-flex flex-wrap align-items-center justify-content-end gap-2 w-100 w-xl-auto">
              <div className="flex-grow-1 flex-xl-grow-0" style={{ minWidth: 210 }}>
                <SearchablePeriodSelect
                  options={periods}
                  value={selectedPeriod}
                  loading={periodsLoading}
                  onChange={(value) => {
                    setSelectedPeriod(value);
                    setPageNumber(0);
                  }}
                />
              </div>

              <button
                type="button"
                className="btn btn-outline-success rounded-2 d-flex align-items-center justify-content-center gap-2"
                disabled={loading || displayedRecords.length === 0}
                onClick={handleExport}
              >
                <Download size={15} />
                Export
              </button>

              <button
                type="button"
                className="btn btn-primary rounded-2 d-flex align-items-center justify-content-center gap-2"
                disabled={loading || !selectedPeriod}
                onClick={() => fetchAuditData(selectedPeriod)}
              >
                <RefreshCw size={15} className={loading ? "spin" : ""} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <TopLoadingBar active={loading} />
      </header>

      {/* =================================================
          MAIN
      ================================================= */}

      <main className="container-fluid px-3 px-lg-4 gst-main-content">
        {/* ERROR */}

        {error && (
          <div className="gst-dashboard-alert">
            <AlertTriangle
              size={18}
            />

            <div>
              <strong>
                Unable to load dashboard
              </strong>

              <span>
                {error}
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                setError(null)
              }
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* =================================================
            KPI SECTION
        ================================================= */}

        <section className="gst-kpi-grid">
          <KpiCard
            title="Total Defaulters"
            value={
              summary.totalQueue
            }
            subtitle="Taxpayers requiring compliance monitoring"
            icon={UserX}
            variant="primary"
            loading={loading}
          />

          <KpiCard
            title="Form GST 3A"
            value={
              summary.form3A
            }
            subtitle="Filing delay between 30 and 89 days"
            icon={Clock3}
            variant="warning"
            loading={loading}
          />

          <KpiCard
            title="Critical Risk"
            value={
              summary.critical
            }
            subtitle="90+ days or critical risk classification"
            icon={ShieldAlert}
            variant="danger"
            loading={loading}
          />

          <KpiCard
            title="High Risk"
            value={
              summary.high
            }
            subtitle="Priority taxpayers for audit review"
            icon={AlertTriangle}
            variant="info"
            loading={loading}
          />
        </section>

        {/* =================================================
            RISK DISTRIBUTION
        ================================================= */}

        <section className="gst-risk-card">
          <div className="gst-section-heading">
            <div>
              <div className="gst-section-title">
                Risk Distribution
              </div>

              <div className="gst-section-subtitle">
                Current period defaulter
                classification
              </div>
            </div>

            <div className="gst-section-total">
              <span>
                Total
              </span>

              <strong>
                {formatNumber(
                  summary.totalQueue
                )}
              </strong>
            </div>
          </div>

          <div className="gst-risk-track">
            <div
              className="gst-risk-segment critical"
              style={{
                width: `${criticalPct}%`,
              }}
              title={`Critical: ${summary.critical}`}
            />

            <div
              className="gst-risk-segment high"
              style={{
                width: `${highPct}%`,
              }}
              title={`High: ${summary.high}`}
            />

            <div
              className="gst-risk-segment form3a"
              style={{
                width: `${form3APct}%`,
              }}
              title={`Form GST 3A: ${summary.form3A}`}
            />
          </div>

          <div className="gst-risk-legend">
            <div>
              <span className="risk-dot critical" />
              <strong>
                {formatNumber(
                  summary.critical
                )}
              </strong>
              <span>
                Critical
              </span>
            </div>

            <div>
              <span className="risk-dot high" />
              <strong>
                {formatNumber(
                  summary.high
                )}
              </strong>
              <span>
                High
              </span>
            </div>

            <div>
              <span className="risk-dot form3a" />
              <strong>
                {formatNumber(
                  summary.form3A
                )}
              </strong>
              <span>
                Form GST 3A
              </span>
            </div>
          </div>
        </section>

        {/* =================================================
            DEFAULTER MONITORING
        ================================================= */}

        <section className="gst-office-card">
          <div className="gst-card-toolbar">
            <div>
              <div className="gst-card-title">
                Return Defaulter Monitoring
              </div>

              <div className="gst-card-subtitle">
                Taxpayer-wise filing default
                review and statutory
                enforcement queue
              </div>
            </div>

            <div className="gst-toolbar-filters">
              <div className="gst-search-control">
                <Search size={15} />

                <input
                  type="search"
                  placeholder="Search GSTIN or period..."
                  value={
                    searchTerm
                  }
                  onChange={(
                    event
                  ) =>
                    setSearchTerm(
                      event.target.value
                    )
                  }
                />

                {searchTerm && (
                  <button
                    type="button"
                    onClick={() =>
                      setSearchTerm(
                        ""
                      )
                    }
                    aria-label="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <select
                className="gst-risk-filter"
                value={
                  riskFilter
                }
                onChange={(
                  event
                ) =>
                  setRiskFilter(
                    event.target.value
                  )
                }
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

              <button
                type="button"
                className={`gst-filter-button ${showAdvanced
                  ? "active"
                  : ""
                  }`}
                onClick={() =>
                  setShowAdvanced(
                    (previous) =>
                      !previous
                  )
                }
              >
                <SlidersHorizontal
                  size={14}
                />

                Filters
              </button>

              {isFilterPending && (
                <span className="gst-filter-loading">
                  <Loader2
                    size={13}
                    className="spin"
                  />

                  Filtering...
                </span>
              )}
            </div>
          </div>

          <TopLoadingBar
            active={loading}
          />

          <AdvancedFilters
            show={
              showAdvanced
            }
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

          {(searchTerm ||
            riskFilter !==
            "ALL" ||
            minRiskScore ||
            maxDelay) && (
              <div className="gst-active-filters">
                <div className="gst-active-label">
                  <Filter size={13} />
                  Active filters
                </div>

                {searchTerm && (
                  <span>
                    Search:{" "}
                    {searchTerm}
                  </span>
                )}

                {riskFilter !==
                  "ALL" && (
                    <span>
                      Risk:{" "}
                      {riskFilter}
                    </span>
                  )}

                {minRiskScore && (
                  <span>
                    Risk ≥{" "}
                    {minRiskScore}%
                  </span>
                )}

                {maxDelay && (
                  <span>
                    Delay ≤{" "}
                    {maxDelay} days
                  </span>
                )}

                <button
                  type="button"
                  onClick={
                    resetFilters
                  }
                >
                  Clear all
                </button>
              </div>
            )}

          {/* =================================================
              TABLE
          ================================================= */}

          <div className="gst-table-wrapper">
            <table className="gst-office-table">
              <thead>
                <tr>
                  <th className="serial-column">
                    Sl.
                  </th>

                  <th>
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

                  <th className="text-center action-column">
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
                        key={
                          index
                        }
                      />
                    )
                  )
                ) : displayedRecords.length ===
                  0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="gst-empty-cell"
                    >
                      <div className="gst-empty-state">
                        <div className="gst-empty-icon">
                          <FilterX
                            size={25}
                          />
                        </div>

                        <div className="gst-empty-title">
                          No matching return
                          defaulters found
                        </div>

                        <div className="gst-empty-text">
                          No taxpayers match
                          the selected period
                          and screening
                          criteria.
                        </div>

                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
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
                    (
                      row,
                      index
                    ) => (
                      <DefaulterRow
                        key={`${row.gstin || "unknown"}-${row.retPeriod || selectedPeriod}-${index}`}
                        row={row}
                        serialNumber={
                          pageNumber *
                          pageSize +
                          index +
                          1
                        }
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

          {/* =================================================
              FOOTER
          ================================================= */}

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
            ) =>
              setPageNumber(
                Math.max(
                  0,
                  Math.min(
                    page,
                    totalPages -
                    1
                  )
                )
              )
            }
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

              setPageNumber(
                0
              );
            }}
          />
        </section>
      </main>

      {/* =================================================
          NOTICE
      ================================================= */}

      <NoticeModal
        show={Boolean(
          modalRecord
        )}
        record={
          modalRecord
        }
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

      {/* =================================================
          TOAST
      ================================================= */}

      <Toast
        toast={toast}
        onClose={() =>
          setToast(null)
        }
      />
    </div>
  );
}