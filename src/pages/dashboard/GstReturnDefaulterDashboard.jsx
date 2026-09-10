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

const MAX_REASON_LENGTH = 4000;

const RISK_CONFIG = {
  CRITICAL: {
    label: "Critical",
    badge: "bg-danger-subtle text-danger border-danger-subtle",
    text: "text-danger",
    dot: "bg-danger",
  },

  HIGH: {
    label: "High",
    badge: "bg-warning-subtle text-warning-emphasis border-warning-subtle",
    text: "text-warning-emphasis",
    dot: "bg-warning",
  },

  MEDIUM: {
    label: "Medium",
    badge: "bg-info-subtle text-info-emphasis border-info-subtle",
    text: "text-info-emphasis",
    dot: "bg-info",
  },

  LOW: {
    label: "Low",
    badge: "bg-success-subtle text-success border-success-subtle",
    text: "text-success",
    dot: "bg-success",
  },
};

/* =========================================================
   GLOBAL HELPERS
========================================================= */

const isAbortError = (error) =>
  error?.name === "AbortError" ||
  error?.name === "CanceledError" ||
  error?.code === "ERR_CANCELED";

const toNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const formatCurrency = (amount) => {
  const value = toNumber(amount);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

const formatNumber = (value) => {
  const number = toNumber(value);

  return new Intl.NumberFormat("en-IN").format(number);
};

const formatPercent = (value) => {
  const number = toNumber(value);

  if (!Number.isFinite(number)) {
    return "0%";
  }

  return `${number.toFixed(number % 1 === 0 ? 0 : 1)}%`;
};

/* =========================================================
   PERIOD HELPERS
========================================================= */

const getPeriodValue = (period) => {
  if (period === null || period === undefined || period === "") {
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

const formatPeriodLabel = (item) => {
  if (!item) {
    return "";
  }

  if (typeof item === "object" && (item.label || item.name)) {
    return String(item.label || item.name);
  }

  const value = getPeriodValue(item).trim();

  if (!/^\d{6}$/.test(value)) {
    return value;
  }

  const month = Number(value.substring(0, 2));
  const year = Number(value.substring(2));

  if (month < 1 || month > 12 || year < 1900) {
    return value;
  }

  const date = new Date(year, month - 1, 1);

  return date.toLocaleString("en-IN", {
    month: "short",
    year: "numeric",
  });
};

/* =========================================================
   RECORD HELPERS
========================================================= */

const getRiskCategory = (row) => {
  const category = String(
    row?.defaulterRiskLevel ||
      row?.riskLevel ||
      row?.riskCategory ||
      "MEDIUM"
  ).toUpperCase();

  return RISK_CONFIG[category] ? category : "MEDIUM";
};

const getRiskScore = (row) => {
  const raw = row?.xgbRiskScore ?? row?.riskScore ?? row?.riskScorePct;

  const value = toNumber(raw);

  const percentage = value <= 1 ? value * 100 : value;

  return Math.max(0, Math.min(100, percentage));
};

const getDelayDays = (row) =>
  Math.max(
    0,
    Math.trunc(toNumber(row?.filingDelayDays ?? row?.delayDays))
  );

const getReturnPeriod = (row) =>
  getPeriodValue(row?.retPeriod || row?.returnPeriod || "");

const getActionRequired = (row) =>
  String(
    row?.statutoryActionRequired ||
      row?.actionRequired ||
      row?.statutoryAction ||
      "Under Audit Scrutiny"
  ).trim() || "Under Audit Scrutiny";

const buildDefaultReason = (row, retPeriod) => {
  const period = getReturnPeriod(row) || retPeriod || "";

  const delay = getDelayDays(row);

  const risk = getRiskCategory(row);

  const score = getRiskScore(row);

  return (
    `GST Audit & Compliance Enforcement: non-filing/anomaly identified ` +
    `for GSTR return period ${formatPeriodLabel(period)} with a filing ` +
    `delay of ${delay} days. Risk classification: ${RISK_CONFIG[risk].label} ` +
    `(score: ${formatPercent(score)}). Statutory action indicated: ${getActionRequired(
      row
    )}.`
  );
};

/* =========================================================
   RECORD ENRICHMENT
========================================================= */

const enrichRecord = (row) => {
  const gstin = String(row?.gstin || "").trim();

  const period = getReturnPeriod(row);

  return {
    ...row,

    gstin,

    retPeriod: period,

    _risk: getRiskCategory(row),

    _score: getRiskScore(row),

    _delay: getDelayDays(row),

    _period: period,

    _action: getActionRequired(row),

    _gstinLower: gstin.toLowerCase(),
  };
};

/* =========================================================
   CSV
========================================================= */

const csvEscape = (value) =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;

const buildCSV = (data) => {
  const headers = [
    "GSTIN",
    "Return Period",
    "Filing Delay (Days)",
    "Taxable Value (INR)",
    "Total Output Tax (INR)",
    "Statutory Action Required",
    "Risk Classification",
    "Risk Score (%)",
  ];

  const rows = data.map((row) => [
    csvEscape(row.gstin),
    csvEscape(formatPeriodLabel(row._period)),
    row._delay,
    toNumber(row.taxableValue),
    toNumber(row.totalOutputTax),
    csvEscape(row._action),
    csvEscape(row._risk),
    row._score,
  ]);

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
};

const exportToCSVAsync = (data, filename, onDone, onError) => {
  if (!Array.isArray(data) || data.length === 0) {
    onError?.("There are no records available for export.");
    return;
  }

  setTimeout(() => {
    try {
      const csv = buildCSV(data);

      const blob = new Blob(["\uFEFF", csv], {
        type: "text/csv;charset=utf-8;",
      });

      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");

      link.href = url;
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);

      onDone?.(data.length);
    } catch (error) {
      onError?.(error?.message || "Failed to build the export file.");
    }
  }, 0);
};

/* =========================================================
   TOAST
========================================================= */

const Toast = React.memo(({ toast, onClose }) => {
  if (!toast) {
    return null;
  }

  const isError = toast.type === "error";

  return (
    <div className="position-fixed top-0 end-0 p-3" style={{ zIndex: 3000 }}>
      <div
        className={`toast show border-0 shadow-lg ${
          isError ? "bg-danger" : "bg-dark"
        } text-white`}
        role="alert"
        style={{ minWidth: 330 }}
      >
        <div className="d-flex align-items-start p-3">
          {isError ? (
            <AlertCircle size={20} className="me-2 mt-1" />
          ) : (
            <CheckCircle2 size={20} className="me-2 mt-1" />
          )}

          <div className="flex-grow-1">
            <div className="fw-semibold">
              {isError ? "Operation Failed" : "Success"}
            </div>

            <div className="small opacity-75 mt-1">{toast.message}</div>
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
});

/* =========================================================
   PERIOD SELECTOR
========================================================= */

const SearchablePeriodSelect = React.memo(
  ({ options = [], value, onChange, loading }) => {
    const [open, setOpen] = useState(false);

    const [search, setSearch] = useState("");

    const containerRef = useRef(null);

    useEffect(() => {
      const handleOutside = (event) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target)
        ) {
          setOpen(false);
        }
      };

      const handleKeyDown = (event) => {
        if (event.key === "Escape") {
          setOpen(false);
        }
      };

      document.addEventListener("mousedown", handleOutside);
      document.addEventListener("keydown", handleKeyDown);

      return () => {
        document.removeEventListener("mousedown", handleOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, []);

    const selectedLabel = useMemo(() => {
      const selected = options.find(
        (item) => getPeriodValue(item) === value
      );

      return selected ? formatPeriodLabel(selected) : value || "Select period";
    }, [options, value]);

    const filteredOptions = useMemo(() => {
      const query = search.trim().toLowerCase();

      if (!query) {
        return options;
      }

      return options.filter((item) => {
        const itemValue = getPeriodValue(item);

        const label = formatPeriodLabel(item);

        return (
          itemValue.toLowerCase().includes(query) ||
          label.toLowerCase().includes(query)
        );
      });
    }, [options, search]);

    return (
      <div
        ref={containerRef}
        className="position-relative"
        style={{ minWidth: 210 }}
      >
        <button
          type="button"
          disabled={loading}
          onClick={() => setOpen((previous) => !previous)}
          className="btn btn-light border d-flex align-items-center justify-content-between w-100 rounded-2 px-3 py-2"
        >
          <span className="d-flex align-items-center gap-2 text-truncate">
            <Calendar size={16} className="text-primary flex-shrink-0" />

            <span className="text-truncate fw-semibold">
              {loading ? "Loading..." : selectedLabel}
            </span>
          </span>

          {loading ? (
            <Loader2 size={15} className="spin ms-2" />
          ) : (
            <ChevronDown
              size={15}
              className="ms-2 period-chevron"
              style={{ transform: open ? "rotate(180deg)" : "none" }}
            />
          )}
        </button>

        {open && !loading && (
          <div className="period-dropdown position-absolute bg-white border rounded-3 shadow-lg p-2 mt-1">
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
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="overflow-auto" style={{ maxHeight: 230 }}>
              {filteredOptions.length === 0 ? (
                <div className="text-center text-muted small py-4">
                  No period found
                </div>
              ) : (
                filteredOptions.map((item, index) => {
                  const itemValue = getPeriodValue(item);

                  const selected = itemValue === value;

                  return (
                    <button
                      key={itemValue || `period-${index}`}
                      type="button"
                      className={`dropdown-item rounded-2 d-flex justify-content-between align-items-center py-2 ${
                        selected ? "active" : ""
                      }`}
                      onClick={() => {
                        onChange(itemValue);
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <span>{formatPeriodLabel(item)}</span>

                      {selected && <CheckCircle2 size={14} />}
                    </button>
                  );
                })
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

const KpiCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "primary",
  loading = false,
}) => {
  const themes = {
    primary: {
      background: "#eef4ff",
      border: "#c7d7fe",
      accent: "#2563eb",
      iconBackground: "#2563eb",
      valueColor: "#123b63",
      subtitleColor: "#52657a",
    },

    danger: {
      background: "#fff1f2",
      border: "#fecdd3",
      accent: "#dc2626",
      iconBackground: "#dc2626",
      valueColor: "#991b1b",
      subtitleColor: "#6b4f55",
    },

    warning: {
      background: "#fff7ed",
      border: "#fed7aa",
      accent: "#ea580c",
      iconBackground: "#f97316",
      valueColor: "#9a3412",
      subtitleColor: "#705b4e",
    },

    info: {
      background: "#ecfeff",
      border: "#a5f3fc",
      accent: "#0891b2",
      iconBackground: "#0891b2",
      valueColor: "#155e75",
      subtitleColor: "#526b73",
    },

    success: {
      background: "#f0fdf4",
      border: "#bbf7d0",
      accent: "#16a34a",
      iconBackground: "#16a34a",
      valueColor: "#166534",
      subtitleColor: "#52675a",
    },
  };

  const theme = themes[variant] || themes.primary;

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
              {formatNumber(value)}
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
   RISK BADGE
========================================================= */

const RiskBadge = React.memo(({ category, score }) => {
  const normalized = RISK_CONFIG[category] ? category : "MEDIUM";

  const config = RISK_CONFIG[normalized];

  return (
    <div className="d-inline-flex flex-column align-items-start">
      <span className={`badge border rounded-2 px-2 py-1 ${config.badge}`}>
        {config.label}
      </span>

      <span className={`small fw-semibold mt-1 ${config.text}`}>
        Score: {formatPercent(score)}
      </span>
    </div>
  );
});

/* =========================================================
   DELAY BADGE
========================================================= */

const DelayBadge = React.memo(({ delay }) => {
  if (delay >= 90) {
    return (
      <span className="badge border rounded-2 px-2 py-1 bg-danger-subtle text-danger border-danger-subtle d-inline-flex align-items-center gap-1">
        <Clock3 size={13} />
        {formatNumber(delay)} days
      </span>
    );
  }

  if (delay >= 30) {
    return (
      <span className="badge border rounded-2 px-2 py-1 bg-warning-subtle text-warning-emphasis border-warning-subtle d-inline-flex align-items-center gap-1">
        <Clock3 size={13} />
        {formatNumber(delay)} days
      </span>
    );
  }

  return (
    <span className="badge border rounded-2 px-2 py-1 bg-success-subtle text-success border-success-subtle d-inline-flex align-items-center gap-1">
      <CheckCircle2 size={13} />
      {formatNumber(delay)} days
    </span>
  );
});

/* =========================================================
   NOTICE MODAL
========================================================= */

const NoticeModal = React.memo(
  ({ show, record, retPeriod, onClose, onSubmit, submitting }) => {
    const [reason, setReason] = useState("");

    useEffect(() => {
      if (!record) {
        return;
      }

      setReason(buildDefaultReason(record, retPeriod));
    }, [record, retPeriod]);

    if (!show || !record) {
      return null;
    }

    const riskCategory = record._risk || getRiskCategory(record);

    const period = record._period || getReturnPeriod(record) || retPeriod;

    const delay = record._delay ?? getDelayDays(record);

    return (
      <div
        className="modal fade show d-block"
        role="dialog"
        aria-modal="true"
        style={{ backgroundColor: "rgba(15, 23, 42, 0.65)" }}
      >
        <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
          <div className="modal-content border-0 shadow-lg rounded-3 overflow-hidden">
            <div className="modal-header bg-dark text-white px-4 py-3">
              <div className="d-flex align-items-center gap-2">
                <ShieldAlert size={20} className="text-warning" />

                <div>
                  <h5 className="modal-title fw-bold mb-0">
                    Dispatch Statutory Notice
                  </h5>

                  <div className="small opacity-75 mt-1">
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

            <div className="modal-body bg-light p-4">
              <div className="row g-3 mb-4">
                <div className="col-md-6">
                  <div className="bg-white border rounded-3 p-3 h-100">
                    <div className="small text-muted text-uppercase fw-bold">
                      GSTIN
                    </div>

                    <div className="font-monospace fw-bold fs-6 mt-1">
                      {record.gstin || "-"}
                    </div>
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="bg-white border rounded-3 p-3 h-100">
                    <div className="small text-muted text-uppercase fw-bold">
                      Period
                    </div>

                    <div className="fw-bold mt-1">
                      {formatPeriodLabel(period)}
                    </div>
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="bg-white border rounded-3 p-3 h-100">
                    <div className="small text-muted text-uppercase fw-bold">
                      Risk
                    </div>

                    <div className="mt-1">
                      <RiskBadge
                        category={riskCategory}
                        score={getRiskScore(record)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="row g-3 mb-3">
                <div className="col-md-4">
                  <div className="bg-white border rounded-3 p-3">
                    <div className="small text-muted">Filing Delay</div>

                    <div className="fw-bold mt-1">
                      {formatNumber(delay)} days
                    </div>
                  </div>
                </div>

                <div className="col-md-4">
                  <div className="bg-white border rounded-3 p-3">
                    <div className="small text-muted">Taxable Value</div>

                    <div className="fw-bold mt-1">
                      {formatCurrency(record.taxableValue)}
                    </div>
                  </div>
                </div>

                <div className="col-md-4">
                  <div className="bg-white border rounded-3 p-3">
                    <div className="small text-muted">Output Tax</div>

                    <div className="fw-bold mt-1">
                      {formatCurrency(record.totalOutputTax)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="alert alert-info border-0 small">
                <strong>Analytical caution:</strong> The statutory action
                shown is a scrutiny signal generated from return filing
                data. It should be verified against applicable records and
                statutory provisions before issuing a notice.
              </div>

              <div className="mb-2">
                <label
                  className="form-label small fw-bold"
                  htmlFor="defaulter-reason"
                >
                  Audit enforcement grounds
                </label>

                <textarea
                  id="defaulter-reason"
                  rows={6}
                  className="form-control"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={submitting}
                  maxLength={MAX_REASON_LENGTH}
                />

                <div className="text-end text-muted small mt-1">
                  {reason.length}/{MAX_REASON_LENGTH}
                </div>
              </div>

              <div className="alert alert-warning d-flex gap-2 align-items-start small mb-0">
                <AlertTriangle size={17} className="flex-shrink-0 mt-1" />

                <div>
                  Please verify the taxpayer, return period and statutory
                  grounds before dispatching the notice.
                </div>
              </div>
            </div>

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
                disabled={submitting || !reason.trim()}
                onClick={() =>
                  onSubmit({
                    gstin: record.gstin,
                    retPeriod: period,
                    actionType: record._action || getActionRequired(record),
                    groundReason: reason.trim(),
                  })
                }
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    Dispatching...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Dispatch Notice
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
   ADVANCED FILTERS
========================================================= */

const AdvancedFilters = React.memo(
  ({
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
      <div className="border-top bg-light px-3 py-3">
        <div className="row g-3 align-items-end">
          <div className="col-md-4">
            <label className="form-label small fw-bold text-muted">
              Minimum Risk Score
            </label>

            <input
              type="number"
              min="0"
              max="100"
              className="form-control form-control-sm"
              value={minRiskScore}
              onChange={(event) => setMinRiskScore(event.target.value)}
              placeholder="0 - 100"
            />
          </div>

          <div className="col-md-4">
            <label className="form-label small fw-bold text-muted">
              Maximum Filing Delay
            </label>

            <input
              type="number"
              min="0"
              className="form-control form-control-sm"
              value={maxDelay}
              onChange={(event) => setMaxDelay(event.target.value)}
              placeholder="Days"
            />
          </div>

          <div className="col-md-4">
            <button
              type="button"
              className="btn btn-sm btn-outline-danger w-100"
              onClick={onReset}
            >
              <FilterX size={14} className="me-1" />
              Reset Filters
            </button>
          </div>
        </div>
      </div>
    );
  }
);

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
   SKELETON
========================================================= */

const SkeletonRow = React.memo(() => (
  <tr className="skeleton-row">
    <td className="ps-3">
      <span className="placeholder-glow d-inline-block w-75">
        <span className="placeholder col-12 rounded-1" style={{ height: 14 }} />
      </span>

      <span className="placeholder-glow d-inline-block mt-2 w-50">
        <span className="placeholder col-12 rounded-1" style={{ height: 10 }} />
      </span>
    </td>

    {Array.from({ length: 6 }).map((_, index) => (
      <td
        key={index}
        className={index === 4 ? "text-center" : "text-end"}
      >
        <span className="placeholder-glow d-inline-block w-75">
          <span
            className="placeholder col-12 rounded-1"
            style={{ height: index === 4 ? 22 : 14 }}
          />
        </span>
      </td>
    ))}
  </tr>
));

/* =========================================================
   TABLE ROW
========================================================= */

const DefaulterRow = ({ row, onNotice }) => {
  const risk = row._risk || getRiskCategory(row);

  const riskConfig = RISK_CONFIG[risk] || RISK_CONFIG.MEDIUM;

  const delay = row._delay ?? getDelayDays(row);

  const score = row._score ?? getRiskScore(row);

  const action = row._action || getActionRequired(row);

  const period = row._period || getReturnPeriod(row);

  return (
    <tr className="gst-data-row">
      {/* Taxpayer */}
      <td className="taxpayer-cell text-center">
        <div className="gstin-value">{row.gstin || "-"}</div>

        <div className="period-value">{formatPeriodLabel(period)}</div>
      </td>

      {/* Filing Delay */}
      <td className="filing-cell text-center">
        <DelayBadge delay={delay} />
      </td>

      {/* Taxable Value */}
      <td className="amount-cell text-end">
        {formatCurrency(row.taxableValue)}
      </td>

      {/* Output Tax */}
      <td className="amount-cell text-end">
        {formatCurrency(row.totalOutputTax)}
      </td>

      {/* Statutory Action */}
      <td className="scrutiny-cell">
        <div className="scrutiny-reason" title={action}>
          {action}
        </div>
      </td>

      {/* Risk */}
      <td className="risk-cell text-center">
        <span className={`risk-badge ${riskConfig.badge}`}>
          {riskConfig.label}
        </span>

        <div className="risk-score">{formatPercent(score)} risk</div>
      </td>

      {/* Action */}
      <td className="action-cell text-center">
        <div className="d-flex justify-content-center align-items-center gap-1">
          <button
            type="button"
            className="btn btn-sm btn-outline-danger action-btn"
            disabled={!row.gstin}
            onClick={() => onNotice(row)}
            title="Issue statutory notice"
            aria-label={`Issue notice for ${row.gstin}`}
          >
            <Send size={14} />
            <span>Notice</span>
          </button>
        </div>
      </td>
    </tr>
  );
};

/* =========================================================
   PAGINATION
========================================================= */

const buildPageWindow = (current, total) => {
  if (total <= 1) {
    return [1];
  }

  const pages = [];

  const start = Math.max(1, current - 1);

  const end = Math.min(total, current + 1);

  if (start > 1) {
    pages.push(1);

    if (start > 2) {
      pages.push("ellipsis-start");
    }
  }

  for (let page = start; page <= end; page += 1) {
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

const PaginationBar = React.memo(
  ({
    pageNumber,
    totalPages,
    totalRecords,
    pageSize,
    onPageChange,
    onPageSizeChange,
    disabled,
  }) => {
    const currentPage = pageNumber + 1;

    const rangeStart = totalRecords === 0 ? 0 : pageNumber * pageSize + 1;

    const rangeEnd = Math.min((pageNumber + 1) * pageSize, totalRecords);

    const pageWindow = useMemo(
      () => buildPageWindow(currentPage, totalPages),
      [currentPage, totalPages]
    );

    return (
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-center gap-3">
        <div className="d-flex flex-wrap align-items-center gap-3">
          <div className="small text-muted">
            Showing{" "}
            <strong className="text-dark">{formatNumber(rangeStart)}</strong>
            {"–"}
            <strong className="text-dark">{formatNumber(rangeEnd)}</strong> of{" "}
            <strong className="text-dark">
              {formatNumber(totalRecords)}
            </strong>{" "}
            records
          </div>

          <div className="d-flex align-items-center gap-2">
            <label className="small text-muted mb-0" htmlFor="page-size-select">
              Rows per page
            </label>

            <select
              id="page-size-select"
              className="form-select form-select-sm"
              style={{ width: 80 }}
              value={pageSize}
              disabled={disabled}
              onChange={(event) =>
                onPageSizeChange(Number(event.target.value))
              }
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>

        <nav aria-label="Defaulter queue pagination">
          <ul className="pagination pagination-sm mb-0 flex-wrap justify-content-center">
            <li
              className={`page-item ${
                pageNumber === 0 || disabled ? "disabled" : ""
              }`}
            >
              <button
                type="button"
                className="page-link d-flex align-items-center"
                aria-label="First page"
                disabled={pageNumber === 0 || disabled}
                onClick={() => onPageChange(0)}
              >
                <ChevronsLeft size={14} />
              </button>
            </li>

            <li
              className={`page-item ${
                pageNumber === 0 || disabled ? "disabled" : ""
              }`}
            >
              <button
                type="button"
                className="page-link d-flex align-items-center"
                aria-label="Previous page"
                disabled={pageNumber === 0 || disabled}
                onClick={() => onPageChange(Math.max(0, pageNumber - 1))}
              >
                <ChevronLeft size={14} />
              </button>
            </li>

            {pageWindow.map((page) =>
              typeof page === "number" ? (
                <li
                  key={page}
                  className={`page-item ${page === currentPage ? "active" : ""}`}
                >
                  <button
                    type="button"
                    className="page-link"
                    disabled={disabled}
                    onClick={() => onPageChange(page - 1)}
                  >
                    {page}
                  </button>
                </li>
              ) : (
                <li key={page} className="page-item disabled">
                  <span className="page-link">…</span>
                </li>
              )
            )}

            <li
              className={`page-item ${
                pageNumber >= totalPages - 1 || disabled ? "disabled" : ""
              }`}
            >
              <button
                type="button"
                className="page-link d-flex align-items-center"
                aria-label="Next page"
                disabled={pageNumber >= totalPages - 1 || disabled}
                onClick={() =>
                  onPageChange(Math.min(totalPages - 1, pageNumber + 1))
                }
              >
                <ChevronRight size={14} />
              </button>
            </li>

            <li
              className={`page-item ${
                pageNumber >= totalPages - 1 || disabled ? "disabled" : ""
              }`}
            >
              <button
                type="button"
                className="page-link d-flex align-items-center"
                aria-label="Last page"
                disabled={pageNumber >= totalPages - 1 || disabled}
                onClick={() => onPageChange(totalPages - 1)}
              >
                <ChevronsRight size={14} />
              </button>
            </li>
          </ul>
        </nav>
      </div>
    );
  }
);

/* =========================================================
   MAIN DASHBOARD
========================================================= */

export default function GstReturnDefaulterDashboard() {
  const [periods, setPeriods] = useState([]);

  const [selectedPeriod, setSelectedPeriod] = useState("");

  const [data, setData] = useState([]);

  const [loading, setLoading] = useState(false);

  const [loadingLabel, setLoadingLabel] = useState("");

  const [periodsLoading, setPeriodsLoading] = useState(false);

  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");

  const [riskFilter, setRiskFilter] = useState("ALL");

  const [showAdvanced, setShowAdvanced] = useState(false);

  const [minRiskScore, setMinRiskScore] = useState("");

  const [maxDelay, setMaxDelay] = useState("");

  const [pageNumber, setPageNumber] = useState(0);

  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [modalRecord, setModalRecord] = useState(null);

  const [submittingNotice, setSubmittingNotice] = useState(false);

  const [toast, setToast] = useState(null);

  const [exporting, setExporting] = useState(false);

  const deferredSearchTerm = useDeferredValue(searchTerm);

  const deferredMinRiskScore = useDeferredValue(minRiskScore);

  const deferredMaxDelay = useDeferredValue(maxDelay);

  const isFilterPending =
    searchTerm !== deferredSearchTerm ||
    minRiskScore !== deferredMinRiskScore ||
    maxDelay !== deferredMaxDelay;

  const fetchControllerRef = useRef(null);

  /* =====================================================
     LOAD PERIODS
  ===================================================== */

  useEffect(() => {
    const controller = new AbortController();

    const loadPeriods = async () => {
      setPeriodsLoading(true);

      try {
        const response = await fetchAllReturnPeriods({
          signal: controller.signal,
        });

        const list = Array.isArray(response)
          ? response
          : Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.content)
          ? response.content
          : [];

        if (list.length > 0) {
          setPeriods(list);

          setSelectedPeriod(getPeriodValue(list[0]));
        }
      } catch (err) {
        if (!isAbortError(err)) {
          console.error("Failed to load return periods", err);

          setError(
            err?.response?.data?.message ||
              err?.message ||
              "Unable to load return periods."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setPeriodsLoading(false);
        }
      }
    };

    loadPeriods();

    return () => controller.abort();
  }, []);

  /* =====================================================
     FETCH DASHBOARD
  ===================================================== */

  const fetchAuditData = useCallback(async (period) => {
    if (!period) {
      return;
    }

    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort();
    }

    const controller = new AbortController();

    fetchControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setLoadingLabel("Checking defaulter queue size...");

    try {
      const probe = await fetchReturnDefaulters({
        retPeriod: period,
        page: 0,
        size: 1,
        riskLevel: "ALL",
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return;
      }

      const expectedTotal = Number(
        probe?.totalElements ?? probe?.totalCount ?? probe?.total
      );

      const hasValidTotal =
        Number.isFinite(expectedTotal) && expectedTotal > 0;

      const fetchSize = hasValidTotal
        ? Math.ceil(expectedTotal + FETCH_SIZE_BUFFER)
        : FALLBACK_SERVER_FETCH_SIZE;

      setLoadingLabel(
        hasValidTotal
          ? `Loading ${formatNumber(expectedTotal)} records...`
          : "Loading defaulter records..."
      );

      const result = await fetchReturnDefaulters({
        retPeriod: period,
        page: 0,
        size: fetchSize,
        riskLevel: "ALL",
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return;
      }

      const records = Array.isArray(result?.content)
        ? result.content
        : Array.isArray(result)
        ? result
        : [];

      const enriched = records.map(enrichRecord);

      setData(enriched);

      if (hasValidTotal && records.length < expectedTotal) {
        setToast({
          type: "error",
          message: `The server returned ${formatNumber(
            records.length
          )} of approximately ${formatNumber(
            expectedTotal
          )} expected records. Please refresh and check backend pagination.`,
        });
      }
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) {
        return;
      }

      console.error("GST return defaulter data loading failed", err);

      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load GST return defaulter data."
      );

      setData([]);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingLabel("");
      }
    }
  }, []);

  /* =====================================================
     PERIOD CHANGE
  ===================================================== */

  useEffect(() => {
    if (!selectedPeriod) {
      return;
    }

    setPageNumber(0);
    setData([]);

    fetchAuditData(selectedPeriod);

    return () => {
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
      }
    };
  }, [selectedPeriod, fetchAuditData]);

  /* =====================================================
     CLIENT FILTERING
  ===================================================== */

  const displayedRecords = useMemo(() => {
    const query = deferredSearchTerm.trim().toLowerCase();

    const parsedMinScore =
      deferredMinRiskScore === "" ? null : Number(deferredMinRiskScore);

    const parsedMaxDelay =
      deferredMaxDelay === "" ? null : Number(deferredMaxDelay);

    const minScore = Number.isFinite(parsedMinScore)
      ? Math.max(0, Math.min(100, parsedMinScore))
      : null;

    const maxDelayValue = Number.isFinite(parsedMaxDelay)
      ? Math.max(0, parsedMaxDelay)
      : null;

    if (
      !query &&
      riskFilter === "ALL" &&
      minScore === null &&
      maxDelayValue === null
    ) {
      return data;
    }

    return data.filter((row) => {
      if (query && !row._gstinLower.includes(query)) {
        return false;
      }

      if (riskFilter !== "ALL" && row._risk !== riskFilter) {
        return false;
      }

      if (minScore !== null && row._score < minScore) {
        return false;
      }

      if (maxDelayValue !== null && row._delay > maxDelayValue) {
        return false;
      }

      return true;
    });
  }, [
    data,
    deferredSearchTerm,
    riskFilter,
    deferredMinRiskScore,
    deferredMaxDelay,
  ]);

  /* =====================================================
     PAGINATION
  ===================================================== */

  const totalElements = displayedRecords.length;

  const totalPages = Math.max(1, Math.ceil(totalElements / pageSize));

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
    setPageNumber((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  const paginatedRecords = useMemo(() => {
    const start = pageNumber * pageSize;

    return displayedRecords.slice(start, start + pageSize);
  }, [displayedRecords, pageNumber, pageSize]);

  /* =====================================================
     FILTER RESET
  ===================================================== */

  const resetFilters = useCallback(() => {
    setSearchTerm("");
    setRiskFilter("ALL");
    setMinRiskScore("");
    setMaxDelay("");
    setPageNumber(0);
  }, []);

  /* =====================================================
     NOTICE
  ===================================================== */

  const openNotice = useCallback((record) => {
    setModalRecord(record);
  }, []);

  const dispatchNotice = useCallback(
    async (payload) => {
      setSubmittingNotice(true);

      try {
        await issueDefaulterNotice(payload);

        setModalRecord(null);

        setToast({
          type: "success",
          message: `Statutory notice dispatched successfully for ${payload.gstin}.`,
        });

        await fetchAuditData(selectedPeriod);
      } catch (err) {
        setToast({
          type: "error",
          message:
            err?.response?.data?.message ||
            err?.message ||
            "Unable to issue statutory notice.",
        });
      } finally {
        setSubmittingNotice(false);
      }
    },
    [fetchAuditData, selectedPeriod]
  );

  /* =====================================================
     KPI
  ===================================================== */

  const totalCount = data.length;

  const criticalCount = data.filter(
    (row) => row._risk === "CRITICAL" || row._delay >= 90
  ).length;

  const highCount = data.filter((row) => row._risk === "HIGH").length;

  const form3ACount = data.filter(
    (row) => row._delay >= 30 && row._delay < 90
  ).length;

  /* =====================================================
     EXPORT
  ===================================================== */

  const handleExport = useCallback(() => {
    if (displayedRecords.length === 0) {
      setToast({
        type: "error",
        message: "There are no records available for export.",
      });

      return;
    }

    setExporting(true);

    setToast({
      type: "success",
      message: `Preparing export of ${formatNumber(
        displayedRecords.length
      )} records...`,
    });

    exportToCSVAsync(
      displayedRecords,
      `GST_Defaulters_${selectedPeriod}.csv`,
      (count) => {
        setExporting(false);

        setToast({
          type: "success",
          message: `Exported ${formatNumber(count)} records.`,
        });
      },
      (message) => {
        setExporting(false);

        setToast({ type: "error", message });
      }
    );
  }, [displayedRecords, selectedPeriod]);

  /* =====================================================
     UI
  ===================================================== */

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
                  onChange={(value) => setSelectedPeriod(value)}
                />
              </div>

              <button
                type="button"
                className="btn btn-outline-success rounded-2 d-flex align-items-center justify-content-center gap-2"
                disabled={loading || exporting || displayedRecords.length === 0}
                onClick={handleExport}
              >
                {exporting ? (
                  <Loader2 size={15} className="spin" />
                ) : (
                  <Download size={15} />
                )}
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

      <main className="container-fluid px-3 px-lg-4 py-4">
        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <div className="alert alert-danger shadow-sm d-flex align-items-start gap-2 rounded-3">
            <AlertTriangle size={18} className="mt-1" />

            <div className="flex-grow-1">
              <div className="fw-bold">Unable to load dashboard</div>

              <div className="small">{error}</div>
            </div>

            <button
              type="button"
              className="btn-close"
              onClick={() => setError(null)}
              aria-label="Close error"
            />
          </div>
        )}

        {/* =================================================
            LOADING
        ================================================= */}

        {loading && loadingLabel && (
          <div className="alert alert-info shadow-sm d-flex align-items-center gap-2 rounded-3 py-2">
            <Loader2 size={16} className="spin" />

            <div className="small fw-semibold">{loadingLabel}</div>
          </div>
        )}

        {/* =========================================================
            KPI GRID — OFFICE / RETURN DEFAULTER
        ========================================================= */}

        <div className="px-2 px-sm-3 px-lg-4">
          <div className="row g-3 mb-4">
            <div className="col-12 col-sm-6 col-xl-3">
              <KpiCard
                title="Total Defaulters"
                value={totalCount}
                subtitle="Compliance monitoring queue"
                icon={UserX}
                variant="primary"
                loading={loading}
              />
            </div>

            <div className="col-12 col-sm-6 col-xl-3">
              <KpiCard
                title="Critical"
                value={criticalCount}
                subtitle="90+ days or critical risk"
                icon={ShieldAlert}
                variant="danger"
                loading={loading}
              />
            </div>

            <div className="col-12 col-sm-6 col-xl-3">
              <KpiCard
                title="High Risk"
                value={highCount}
                subtitle="Officer review"
                icon={AlertTriangle}
                variant="warning"
                loading={loading}
              />
            </div>

            <div className="col-12 col-sm-6 col-xl-3">
              <KpiCard
                title="Form GST 3A"
                value={form3ACount}
                subtitle="Delay between 30 and 89 days"
                icon={SlidersHorizontal}
                variant="info"
                loading={loading}
              />
            </div>
          </div>
        </div>

        {/* =========================================================
            RISK DISTRIBUTION — COMPACT MODERN OFFICE UI
        ========================================================= */}

        <div className="gst-risk-card mb-4">
          <div className="gst-risk-header">
            <div className="gst-risk-title-wrap">
              <div className="gst-risk-title">Risk Distribution</div>

              <span className="gst-risk-total">
                {formatNumber(totalCount)} total defaulters
              </span>
            </div>

            <div className="gst-risk-total-percent">100%</div>
          </div>

          <div
            className="gst-risk-bar"
            role="progressbar"
            aria-label="Risk distribution"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              className="gst-risk-segment critical"
              style={{
                width: `${totalCount ? (criticalCount / totalCount) * 100 : 0}%`,
              }}
              title={`Critical: ${formatNumber(criticalCount)}`}
            />

            <div
              className="gst-risk-segment high"
              style={{
                width: `${totalCount ? (highCount / totalCount) * 100 : 0}%`,
              }}
              title={`High: ${formatNumber(highCount)}`}
            />

            <div
              className="gst-risk-segment medium"
              style={{
                width: `${totalCount ? (form3ACount / totalCount) * 100 : 0}%`,
              }}
              title={`Form GST 3A: ${formatNumber(form3ACount)}`}
            />
          </div>

          <div className="gst-risk-summary">
            <div className="gst-risk-item critical-item">
              <span className="gst-risk-dot critical-dot" />

              <div className="gst-risk-item-content">
                <span className="gst-risk-label">Critical</span>

                <strong>{formatNumber(criticalCount)}</strong>
              </div>
            </div>

            <div className="gst-risk-item high-item">
              <span className="gst-risk-dot high-dot" />

              <div className="gst-risk-item-content">
                <span className="gst-risk-label">High</span>

                <strong>{formatNumber(highCount)}</strong>
              </div>
            </div>

            <div className="gst-risk-item medium-item">
              <span className="gst-risk-dot medium-dot" />

              <div className="gst-risk-item-content">
                <span className="gst-risk-label">Form GST 3A</span>

                <strong>{formatNumber(form3ACount)}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* =================================================
            DEFAULTER QUEUE
        ================================================= */}

        <section className="card border-0 shadow-sm rounded-3 overflow-hidden">
          <div className="card-header bg-white border-bottom p-3">
            <div className="d-flex align-items-center justify-content-between gap-3 flex-nowrap">
              <div className="flex-shrink-0 text-nowrap">
                <h5 className="fw-bold text-dark mb-0">
                  Review return filing defaulters
                </h5>

                <div className="small text-muted mt-1">
                  {formatNumber(totalElements)} matching records
                </div>
              </div>

              <div className="d-flex align-items-center justify-content-end gap-2 flex-nowrap ms-auto">
                <div className="input-group input-group-sm" style={{ width: "280px" }}>
                  <span className="input-group-text bg-white">
                    {isFilterPending ? (
                      <Loader2 size={14} className="text-muted spin" />
                    ) : (
                      <Search size={14} className="text-muted" />
                    )}
                  </span>

                  <input
                    type="search"
                    className="form-control"
                    placeholder="Search GSTIN..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    aria-label="Search GSTIN"
                  />

                  {searchTerm && (
                    <button
                      type="button"
                      className="btn btn-light border"
                      onClick={() => setSearchTerm("")}
                      aria-label="Clear search"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                <select
                  className="form-select form-select-sm"
                  style={{ width: "135px", flexShrink: 0 }}
                  value={riskFilter}
                  onChange={(event) => setRiskFilter(event.target.value)}
                  aria-label="Risk filter"
                >
                  <option value="ALL">All risk</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>

                <button
                  type="button"
                  className={`btn btn-sm d-flex align-items-center gap-1 flex-shrink-0 ${
                    showAdvanced ? "btn-primary" : "btn-outline-secondary"
                  }`}
                  onClick={() => setShowAdvanced((previous) => !previous)}
                >
                  <Filter size={14} />
                  Filters
                </button>
              </div>
            </div>
          </div>

          <AdvancedFilters
            show={showAdvanced}
            minRiskScore={minRiskScore}
            setMinRiskScore={setMinRiskScore}
            maxDelay={maxDelay}
            setMaxDelay={setMaxDelay}
            onReset={resetFilters}
          />

          {(searchTerm || riskFilter !== "ALL" || minRiskScore || maxDelay) && (
            <div className="px-3 py-2 bg-light border-bottom d-flex flex-wrap align-items-center gap-2">
              <span className="small fw-bold text-muted">Active filters:</span>

              {searchTerm && (
                <span className="badge bg-white text-dark border">
                  GSTIN: {searchTerm}
                </span>
              )}

              {riskFilter !== "ALL" && (
                <span className="badge bg-white text-dark border">
                  Risk: {riskFilter}
                </span>
              )}

              {minRiskScore && (
                <span className="badge bg-white text-dark border">
                  Risk ≥ {minRiskScore}
                </span>
              )}

              {maxDelay && (
                <span className="badge bg-white text-dark border">
                  Delay ≤ {maxDelay} days
                </span>
              )}

              <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                {formatNumber(totalElements)} match
                {totalElements === 1 ? "" : "es"}
              </span>

              <button
                type="button"
                className="btn btn-link btn-sm text-danger p-0 ms-1"
                onClick={resetFilters}
              >
                Clear all
              </button>
            </div>
          )}

          <div className="table-responsive gst-table-wrapper">
            <table className="table table-hover align-middle mb-0 gst-office-table">
              <thead>
                <tr className="official-table-header">
                  <th className="text-center taxpayer-column">Taxpayer</th>

                  <th className="text-center filing-column">Filing Delay</th>

                  <th className="text-center amount-column">Taxable Value</th>

                  <th className="text-center amount-column">Output Tax</th>

                  <th className="text-center scrutiny-column">
                    Statutory Action
                  </th>

                  <th className="text-center risk-column">Risk</th>

                  <th className="text-center action-column">Action</th>
                </tr>
              </thead>

              <tbody>
                {loading && data.length === 0 ? (
                  Array.from({ length: pageSize }).map((_, index) => (
                    <SkeletonRow key={`skeleton-${index}`} />
                  ))
                ) : paginatedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="gst-empty-cell">
                      <div className="gst-empty-state">
                        <div className="empty-state-icon">
                          <FilterX size={25} />
                        </div>

                        <div className="empty-state-title">
                          No return defaulters found
                        </div>

                        <div className="empty-state-description">
                          No taxpayer records match the selected period or
                          applied filters.
                        </div>

                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary mt-3"
                          onClick={resetFilters}
                        >
                          Reset filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedRecords.map((row, index) => (
                    <DefaulterRow
                      key={row.serialNo || `${row.gstin}-${row._period}-${index}`}
                      row={row}
                      onNotice={openNotice}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="card-footer bg-white border-top p-3">
            <PaginationBar
              pageNumber={pageNumber}
              totalPages={totalPages}
              totalRecords={totalElements}
              pageSize={pageSize}
              onPageChange={setPageNumber}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPageNumber(0);
              }}
              disabled={loading}
            />
          </div>
        </section>
      </main>

      {/* =================================================
          NOTICE MODAL
      ================================================= */}

      <NoticeModal
        show={Boolean(modalRecord)}
        record={modalRecord}
        retPeriod={selectedPeriod}
        onClose={() => setModalRecord(null)}
        onSubmit={dispatchNotice}
        submitting={submittingNotice}
      />

      {/* =================================================
          TOAST
      ================================================= */}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
