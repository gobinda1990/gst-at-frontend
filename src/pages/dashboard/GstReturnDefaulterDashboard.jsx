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

// Used only if the endpoint cannot report a usable total count.
const FALLBACK_SERVER_FETCH_SIZE = 750000;
const FETCH_SIZE_BUFFER = 200;

const RISK_CONFIG = {
  CRITICAL: {
    label: "Critical",
    badge: "bg-danger-subtle text-danger border-danger-subtle",
    text: "text-danger",
  },
  HIGH: {
    label: "High",
    badge: "bg-warning-subtle text-warning-emphasis border-warning-subtle",
    text: "text-warning-emphasis",
  },
  MEDIUM: {
    label: "Medium",
    badge: "bg-info-subtle text-info-emphasis border-info-subtle",
    text: "text-info-emphasis",
  },
};

const DELAY_CONFIG = {
  CRITICAL: {
    badge: "bg-danger-subtle text-danger border-danger-subtle",
  },
  WARNING: {
    badge: "bg-warning-subtle text-warning-emphasis border-warning-subtle",
  },
  NORMAL: {
    badge: "bg-light text-secondary border-secondary-subtle",
  },
};

/* =========================================================
   GLOBAL HELPERS
========================================================= */

const formatCurrency = (amount) => {
  const value = Number(amount);

  if (!Number.isFinite(value)) return "₹0";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

const formatNumber = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number)) return "0";

  return new Intl.NumberFormat("en-IN").format(number);
};

const getPeriodValue = (period) => {
  if (!period) return "";

  if (typeof period === "object") {
    return (
      period.value ||
      period.id ||
      period.retPeriod ||
      Object.values(period)[0] ||
      ""
    );
  }

  return String(period);
};

const formatPeriodLabel = (period) => {
  if (!period) return "";

  if (typeof period === "object" && (period.label || period.name)) {
    return period.label || period.name;
  }

  const value = getPeriodValue(period);

  if (!value || value.length !== 6) {
    return value || "";
  }

  const month = Number(value.substring(0, 2));
  const year = value.substring(2);

  if (month < 1 || month > 12) {
    return value;
  }

  const date = new Date(Number(year), month - 1, 1);

  return date.toLocaleString("en-IN", {
    month: "short",
    year: "numeric",
  });
};

const getRiskCategory = (row) =>
  String(row?.defaulterRiskLevel || "MEDIUM").toUpperCase();

const getRiskScorePct = (row) => {
  const raw = row?.xgbRiskScore;

  if (raw === undefined || raw === null || raw === "") return null;

  const value = Number(raw);

  if (!Number.isFinite(value)) return null;

  return value <= 1 ? value * 100 : value;
};

const getDelayDays = (row) => Number(row?.filingDelayDays) || 0;

const getDelayTier = (delay) => {
  if (delay >= 90) return "CRITICAL";
  if (delay >= 30) return "WARNING";
  return "NORMAL";
};

const getActionRequired = (row) =>
  row?.statutoryActionRequired || "Under Audit Scrutiny";

/**
 * Precompute expensive values once after the full dataset is fetched.
 * Filtering/searching then uses simple property reads, which keeps the UI
 * responsive even for very large datasets.
 */
const enrichRecord = (row) => {
  const delay = Number(row?.filingDelayDays) || 0;
  const rawRiskScore = row?.xgbRiskScore;
  const parsedRiskScore =
    rawRiskScore === undefined || rawRiskScore === null || rawRiskScore === ""
      ? 0
      : Number(rawRiskScore);

  const score = Number.isFinite(parsedRiskScore)
    ? parsedRiskScore <= 1
      ? parsedRiskScore * 100
      : parsedRiskScore
    : 0;

  return {
    ...row,
    _risk: getRiskCategory(row),
    _score: score,
    _delay: delay,
    _gstinLower: String(row?.gstin || "").toLowerCase(),
    _action: getActionRequired(row),
  };
};

const buildDefaultReason = (row, retPeriod) =>
  `GST Audit & Compliance Enforcement: Non-filing/anomaly identified for GSTR return period ${
    row?.retPeriod || retPeriod || ""
  } with filing delay of ${getDelayDays(row)} days.`;

const csvEscape = (value) =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;

/* =========================================================
   CSV EXPORT
========================================================= */

const exportToCSV = (data, filename = "GST_Defaulter_Report.csv") => {
  if (!Array.isArray(data) || data.length === 0) return;

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
    csvEscape(formatPeriodLabel(row.retPeriod)),
    getDelayDays(row),
    row.taxableValue || 0,
    row.totalOutputTax || 0,
    csvEscape(getActionRequired(row)),
    csvEscape(getRiskCategory(row)),
    getRiskScorePct(row) ?? 0,
  ]);

  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
    "\n"
  );

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};

/* =========================================================
   TOAST
========================================================= */

const Toast = React.memo(({ toast, onClose }) => {
  if (!toast) return null;

  const isError = toast.type === "error";

  return (
    <div className="position-fixed top-0 end-0 p-3" style={{ zIndex: 2000 }}>
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
        if (event.key === "Escape") setOpen(false);
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

      if (!query) return options;

      return options.filter((item) => {
        const val = String(getPeriodValue(item)).toLowerCase();
        const label = formatPeriodLabel(item).toLowerCase();

        return val.includes(query) || label.includes(query);
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
          onClick={() => setOpen((prev) => !prev)}
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
              className="ms-2"
              style={{ transform: open ? "rotate(180deg)" : "none" }}
            />
          )}
        </button>

        {open && !loading && (
          <div
            className="position-absolute bg-white border rounded-3 shadow-lg p-2 mt-1"
            style={{ zIndex: 1100, width: 260, left: 0 }}
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
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="overflow-auto" style={{ maxHeight: 230 }}>
              {filteredOptions.length === 0 ? (
                <div className="text-center text-muted small py-4">
                  No period found
                </div>
              ) : (
                filteredOptions.map((item, index) => {
                  const val = getPeriodValue(item);
                  const selected = val === value;

                  return (
                    <button
                      key={val || index}
                      type="button"
                      className={`dropdown-item rounded-2 d-flex justify-content-between align-items-center py-2 ${
                        selected ? "active" : ""
                      }`}
                      onClick={() => {
                        onChange(val);
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

const KpiCard = React.memo(
  ({ title, value, subtitle, icon: Icon, variant = "primary", loading }) => {
    const styles = {
      primary: { border: "border-primary", icon: "bg-primary-subtle text-primary" },
      danger: { border: "border-danger", icon: "bg-danger-subtle text-danger" },
      warning: {
        border: "border-warning",
        icon: "bg-warning-subtle text-warning-emphasis",
      },
      info: { border: "border-info", icon: "bg-info-subtle text-info-emphasis" },
    };

    const style = styles[variant] || styles.primary;

    return (
      <div
        className={`card h-100 border-0 border-start border-4 ${style.border} shadow-sm rounded-3`}
      >
        <div className="card-body p-3">
          <div className="d-flex justify-content-between align-items-start">
            <div className="min-w-0">
              <div className="text-uppercase text-muted fw-bold small">
                {title}
              </div>

              <div className="fs-3 fw-bold text-dark mt-1">
                {loading ? (
                  <span className="placeholder-glow">
                    <span className="placeholder col-7" style={{ height: 30 }} />
                  </span>
                ) : (
                  formatNumber(value)
                )}
              </div>

              {subtitle && (
                <div className="small text-muted mt-1">{subtitle}</div>
              )}
            </div>

            <div className={`rounded-3 p-2 ${style.icon}`}>
              <Icon size={21} />
            </div>
          </div>
        </div>
      </div>
    );
  }
);

/* =========================================================
   RISK / DELAY BADGES
========================================================= */

const RiskBadge = ({ category, score }) => {
  const config = RISK_CONFIG[category] || RISK_CONFIG.MEDIUM;

  return (
    <div className="d-inline-flex flex-column align-items-center">
      <span className={`badge border rounded-2 px-2 py-1 ${config.badge}`}>
        {config.label}
      </span>

      {score !== null && score !== undefined && (
        <span className={`small fw-semibold mt-1 ${config.text}`}>
          Score: {score.toFixed(0)}%
        </span>
      )}
    </div>
  );
};

const DelayBadge = ({ delay }) => {
  const tier = getDelayTier(delay);
  const config = DELAY_CONFIG[tier];

  return (
    <span
      className={`badge border rounded-2 px-2 py-1 d-inline-flex align-items-center gap-1 ${config.badge}`}
    >
      <Clock3 size={12} />
      {delay} days
    </span>
  );
};

const ActionBadge = ({ action }) => {
  if (!action) {
    return <span className="small text-muted">Under Audit Scrutiny</span>;
  }

  let cls = "bg-primary-subtle text-primary border-primary-subtle";

  if (action.includes("REG-17")) {
    cls = "bg-danger-subtle text-danger border-danger-subtle";
  } else if (action.includes("3A")) {
    cls = "bg-warning-subtle text-warning-emphasis border-warning-subtle";
  }

  return (
    <span
      className={`badge border rounded-2 px-2 py-1 d-inline-flex align-items-center gap-1 ${cls}`}
      style={{ whiteSpace: "normal", textAlign: "center" }}
    >
      <FileText size={12} className="flex-shrink-0" />
      {action}
    </span>
  );
};

/* =========================================================
   NOTICE MODAL
========================================================= */

const NoticeModal = React.memo(
  ({ show, record, retPeriod, onClose, onSubmit, submitting }) => {
    const [reason, setReason] = useState("");

    useEffect(() => {
      if (!record) return;

      setReason(buildDefaultReason(record, retPeriod));
    }, [record, retPeriod]);

    if (!show || !record) return null;

    const riskCategory = getRiskCategory(record);

    return (
      <div
        className="modal fade show d-block"
        role="dialog"
        aria-modal="true"
        style={{ backgroundColor: "rgba(15, 23, 42, 0.65)" }}
      >
        <div className="modal-dialog modal-dialog-centered modal-lg">
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
              />
            </div>

            <div className="modal-body bg-light p-4">
              <div className="row g-3 mb-4">
                <div className="col-md-6">
                  <div className="bg-white border rounded-3 p-3">
                    <div className="small text-muted text-uppercase fw-bold">
                      GSTIN
                    </div>

                    <div className="font-monospace fw-bold fs-6 mt-1">
                      {record.gstin}
                    </div>
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="bg-white border rounded-3 p-3">
                    <div className="small text-muted text-uppercase fw-bold">
                      Period
                    </div>

                    <div className="fw-bold mt-1">
                      {formatPeriodLabel(record.retPeriod || retPeriod)}
                    </div>
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="bg-white border rounded-3 p-3">
                    <div className="small text-muted text-uppercase fw-bold">
                      Risk
                    </div>

                    <div className="mt-1">
                      <RiskBadge
                        category={riskCategory}
                        score={getRiskScorePct(record)}
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
                      {getDelayDays(record)} days
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

              <div className="mb-2">
                <label className="form-label small fw-bold">
                  Audit enforcement grounds
                </label>

                <textarea
                  rows={5}
                  className="form-control"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={submitting}
                  maxLength={4000}
                />

                <div className="text-end text-muted small mt-1">
                  {reason.length}/4000
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
                    retPeriod: record.retPeriod || retPeriod,
                    actionType: getActionRequired(record),
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
   ADVANCED FILTER PANEL
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
            onChange={(e) => setMinRiskScore(e.target.value)}
            placeholder="e.g. 70"
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
            onChange={(e) => setMaxDelay(e.target.value)}
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
};

/* =========================================================
   TABLE ROW
========================================================= */

const DefaulterRow = React.memo(({ row, retPeriod, onNotice }) => {
  const riskCategory = getRiskCategory(row);
  const delay = getDelayDays(row);

  return (
    <tr>
      <td className="text-center">
        <div className="fw-bold font-monospace text-dark">
          {row.gstin || "-"}
        </div>

        <div className="small text-muted mt-1">
          {formatPeriodLabel(row.retPeriod || retPeriod)}
        </div>
      </td>

      <td className="text-center">
        <DelayBadge delay={delay} />
      </td>

      <td className="text-center">
        <div className="fw-semibold font-monospace">
          {formatCurrency(row.taxableValue)}
        </div>

        <div className="small text-muted">Taxable value</div>
      </td>

      <td className="text-center">
        <div className="fw-semibold font-monospace">
          {formatCurrency(row.totalOutputTax)}
        </div>

        <div className="small text-muted">Output tax</div>
      </td>

      <td className="text-center">
        <ActionBadge action={getActionRequired(row)} />
      </td>

      <td className="text-center">
        <RiskBadge category={riskCategory} score={getRiskScorePct(row)} />
      </td>

      <td className="text-center">
        <button
          type="button"
          className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1"
          onClick={() => onNotice(row)}
        >
          <Send size={13} />
          Notice
        </button>
      </td>
    </tr>
  );
});

const SkeletonRow = () => (
  <tr>
    <td className="text-center">
      <span className="placeholder-glow d-inline-block" style={{ width: "70%" }}>
        <span className="placeholder col-12 rounded-1" style={{ height: 14 }} />
      </span>
      <span
        className="placeholder-glow d-inline-block mt-2"
        style={{ width: "45%" }}
      >
        <span className="placeholder col-12 rounded-1" style={{ height: 10 }} />
      </span>
    </td>

    <td className="text-center">
      <span className="placeholder-glow d-inline-block" style={{ width: 70 }}>
        <span className="placeholder col-12 rounded-pill" style={{ height: 22 }} />
      </span>
    </td>

    <td className="text-center">
      <span className="placeholder-glow d-inline-block" style={{ width: "65%" }}>
        <span className="placeholder col-12 rounded-1" style={{ height: 14 }} />
      </span>
    </td>

    <td className="text-center">
      <span className="placeholder-glow d-inline-block" style={{ width: "65%" }}>
        <span className="placeholder col-12 rounded-1" style={{ height: 14 }} />
      </span>
    </td>

    <td className="text-center">
      <span className="placeholder-glow d-inline-block" style={{ width: "80%" }}>
        <span className="placeholder col-12 rounded-pill" style={{ height: 22 }} />
      </span>
    </td>

    <td className="text-center">
      <span className="placeholder-glow d-inline-block" style={{ width: 90 }}>
        <span className="placeholder col-12 rounded-pill" style={{ height: 22 }} />
      </span>
    </td>

    <td className="text-center">
      <span className="placeholder-glow d-inline-block" style={{ width: 80 }}>
        <span className="placeholder col-12 rounded-2" style={{ height: 30 }} />
      </span>
    </td>
  </tr>
);

const TopLoadingBar = ({ active }) => {
  if (!active) return null;

  return (
    <>
      <div
        style={{
          height: 3,
          width: "100%",
          background: "#e7ecf3",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: "40%",
            background: "linear-gradient(90deg, #0d6efd, #6ea8fe)",
            borderRadius: 2,
            animation: "topbar-slide 1.1s ease-in-out infinite",
          }}
        />
      </div>     
    </>
  );
};

/* =========================================================
   CLIENT-SIDE PAGINATION
========================================================= */

const buildPageWindow = (current, total) => {
  const pages = [];
  const windowSize = 1;
  const start = Math.max(1, current - windowSize);
  const end = Math.min(total, current + windowSize);

  if (start > 1) {
    pages.push(1);
    if (start > 2) pages.push("ellipsis-start");
  }

  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }

  if (end < total) {
    if (end < total - 1) pages.push("ellipsis-end");
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
        <div className="d-flex align-items-center gap-3">
          <div className="small text-muted">
            Showing <strong className="text-dark">{formatNumber(rangeStart)}</strong>
            {"–"}
            <strong className="text-dark">{formatNumber(rangeEnd)}</strong> of{" "}
            <strong className="text-dark">{formatNumber(totalRecords)}</strong> records
          </div>

          <div className="d-flex align-items-center gap-2">
            <label className="small text-muted mb-0" htmlFor="defaulter-page-size">
              Rows per page
            </label>
            <select
              id="defaulter-page-size"
              className="form-select form-select-sm"
              style={{ width: 80 }}
              value={pageSize}
              disabled={disabled}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>

        <nav aria-label="Defaulter pagination">
          <ul className="pagination pagination-sm mb-0">
            <li className={`page-item ${pageNumber === 0 || disabled ? "disabled" : ""}`}>
              <button
                type="button"
                className="page-link d-flex align-items-center"
                aria-label="First page"
                onClick={() => onPageChange(0)}
              >
                <ChevronsLeft size={14} />
              </button>
            </li>

            <li className={`page-item ${pageNumber === 0 || disabled ? "disabled" : ""}`}>
              <button
                type="button"
                className="page-link d-flex align-items-center"
                aria-label="Previous page"
                onClick={() => onPageChange(Math.max(0, pageNumber - 1))}
              >
                <ChevronLeft size={14} />
              </button>
            </li>

            {pageWindow.map((page) =>
              typeof page === "string" ? (
                <li className="page-item disabled" key={page}>
                  <span className="page-link">…</span>
                </li>
              ) : (
                <li
                  className={`page-item ${page === currentPage ? "active" : ""}`}
                  key={page}
                >
                  <button
                    type="button"
                    className="page-link"
                    onClick={() => onPageChange(page - 1)}
                  >
                    {page}
                  </button>
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
                onClick={() => onPageChange(Math.min(totalPages - 1, pageNumber + 1))}
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
  const [periodsLoading, setPeriodsLoading] = useState(false);

  const [data, setData] = useState([]);
  const [summary, setSummary] = useState({
    totalQueue: 0,
    form3A: 0,
    critical: 0,
    high: 0,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [riskFilter, setRiskFilter] = useState("ALL");

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [minRiskScore, setMinRiskScore] = useState("");
  const [maxDelay, setMaxDelay] = useState("");

  // Pagination is entirely client-side over the complete fetched dataset.
  const [pageNumber, setPageNumber] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const deferredMinRiskScore = useDeferredValue(minRiskScore);
  const deferredMaxDelay = useDeferredValue(maxDelay);

  const isFilterPending =
    searchTerm !== deferredSearchTerm ||
    minRiskScore !== deferredMinRiskScore ||
    maxDelay !== deferredMaxDelay;

  const [modalRecord, setModalRecord] = useState(null);
  const [submittingNotice, setSubmittingNotice] = useState(false);

  const [toast, setToast] = useState(null);

  const abortControllerRef = useRef(null);

  /* =====================================================
     LOAD PERIODS
  ===================================================== */

  useEffect(() => {
    let mounted = true;

    const loadPeriods = async () => {
      setPeriodsLoading(true);

      try {
        const response = await fetchAllReturnPeriods();

        if (mounted && Array.isArray(response) && response.length > 0) {
          setPeriods(response);
          setSelectedPeriod(getPeriodValue(response[0]));
        }
      } catch (err) {
        console.error("Failed to load return periods", err);
      } finally {
        if (mounted) setPeriodsLoading(false);
      }
    };

    loadPeriods();

    return () => {
      mounted = false;
    };
  }, []);

  /* =====================================================
     FETCH ALL RECORDS ONCE PER RETURN PERIOD
  ===================================================== */

  const fetchAuditData = useCallback(async (period) => {
    if (!period) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      // First request only determines the real record count.
      const probe = await fetchReturnDefaulters({
        retPeriod: period,
        page: 0,
        size: 1,
        riskLevel: "ALL",
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      const reportedTotal = Number(probe?.totalElements);
      const fetchSize =
        Number.isFinite(reportedTotal) && reportedTotal > 0
          ? reportedTotal + FETCH_SIZE_BUFFER
          : FALLBACK_SERVER_FETCH_SIZE;

      const result = await fetchReturnDefaulters({
        retPeriod: period,
        page: 0,
        size: fetchSize,
        riskLevel: "ALL",
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      const records = Array.isArray(result?.content)
        ? result.content
        : Array.isArray(result)
        ? result
        : [];

      const enriched = records.map(enrichRecord);
      setData(enriched);

      const serverSummary =
        result?.summary || result?.metrics || result?.statistics ||
        probe?.summary || probe?.metrics || probe?.statistics || {};

      const totalQueue =
        Number.isFinite(reportedTotal) && reportedTotal >= 0
          ? reportedTotal
          : enriched.length;

      setSummary({
        totalQueue,
        form3A: Number(
          serverSummary.form3A ??
            enriched.filter((item) => item._delay >= 30 && item._delay < 90).length
        ),
        critical: Number(
          serverSummary.critical ??
            enriched.filter(
              (item) => item._delay >= 90 || item._risk === "CRITICAL"
            ).length
        ),
        high: Number(
          serverSummary.high ??
            enriched.filter((item) => item._risk === "HIGH").length
        ),
      });
    } catch (err) {
      if (err?.name !== "CanceledError" && err?.name !== "AbortError") {
        setError(
          err?.response?.data?.message ||
            err?.message ||
            "Unable to load GST return defaulter data."
        );
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedPeriod) return;

    setPageNumber(0);
    fetchAuditData(selectedPeriod);

    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [selectedPeriod, fetchAuditData]);

  /* =====================================================
     CLIENT-SIDE FILTERING
  ===================================================== */

  const displayedRecords = useMemo(() => {
    const query = deferredSearchTerm.trim().toLowerCase();
    const minScore =
      deferredMinRiskScore === "" ? null : Number(deferredMinRiskScore);
    const maxDelayValue =
      deferredMaxDelay === "" ? null : Number(deferredMaxDelay);

    if (
      !query &&
      riskFilter === "ALL" &&
      minScore === null &&
      maxDelayValue === null
    ) {
      return data;
    }

    return data.filter((row) => {
      if (query && !row._gstinLower.includes(query)) return false;

      if (riskFilter !== "ALL" && row._risk !== riskFilter) return false;

      if (minScore !== null && row._score < minScore) return false;

      if (maxDelayValue !== null && row._delay > maxDelayValue) return false;

      return true;
    });
  }, [
    data,
    deferredSearchTerm,
    riskFilter,
    deferredMinRiskScore,
    deferredMaxDelay,
  ]);

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
     RESET FILTERS
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
          message: `Statutory notice successfully dispatched to ${payload.gstin}.`,
        });

        await fetchAuditData(selectedPeriod);
      } catch (err) {
        setToast({
          type: "error",
          message:
            err?.response?.data?.message ||
            err?.message ||
            "Unable to issue notice.",
        });
      } finally {
        setSubmittingNotice(false);
      }
    },
    [fetchAuditData, selectedPeriod, pageNumber, riskFilter]
  );

  /* =====================================================
     EXPORT
  ===================================================== */

  const handleExport = () => {
    if (displayedRecords.length === 0) {
      setToast({
        type: "error",
        message: "There are no records available for export.",
      });

      return;
    }

    exportToCSV(
      displayedRecords,
      `GST_Defaulters_${selectedPeriod}.csv`
    );
  };

  /* =====================================================
     UI
  ===================================================== */

  return (
    <div className="min-vh-100" style={{ background: "#f4f6f9" }}>
      {/* HEADER */}

      <header
        className="bg-white border-bottom"
        style={{ position: "sticky", top: 0, zIndex: 1000 }}
      >
        <div className="container-fluid px-3 px-lg-4 py-3">
          <div className="d-flex flex-column flex-xl-row justify-content-between gap-3">
            <div>
              <div className="d-flex align-items-center gap-2">
                <div
                  className="bg-primary text-white rounded-2 d-flex align-items-center justify-content-center"
                  style={{ width: 38, height: 38 }}
                >
                  <UserX size={20} />
                </div>

                <div> 
                  <div className="Medium text-muted text-nowrap">
                   <h5 className="fw-bold text-dark mb-0 text-truncate">Filing Delay & Statutory Enforcement Monitoring</h5>
                  </div>
                </div>
              </div>
            </div>

            <div className="d-flex flex-wrap align-items-center gap-2">
              <SearchablePeriodSelect
                options={periods}
                value={selectedPeriod}
                loading={periodsLoading}
                onChange={(value) => {
                  setSelectedPeriod(value);
                  setPageNumber(0);
                }}
              />

              <button
                type="button"
                className="btn btn-outline-success rounded-2 d-flex align-items-center gap-2"
                disabled={loading || displayedRecords.length === 0}
                onClick={handleExport}
              >
                <Download size={15} />
                Export
              </button>

              <button
                type="button"
                className="btn btn-primary rounded-2 d-flex align-items-center gap-2"
                disabled={loading || !selectedPeriod}
                onClick={() =>
                  fetchAuditData(selectedPeriod)
                }
              >
                <RefreshCw size={15} className={loading ? "spin" : ""} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container-fluid px-3 px-lg-4 py-4">
        {/* ERROR */}

        {error && (
          <div className="alert alert-danger border-0 shadow-sm d-flex align-items-start gap-2 rounded-3">
            <AlertTriangle size={18} className="mt-1" />

            <div className="flex-grow-1">
              <div className="fw-bold">Unable to load dashboard</div>
              <div className="small">{error}</div>
            </div>

            <button
              type="button"
              className="btn-close"
              onClick={() => setError(null)}
            />
          </div>
        )}

        {/* KPI GRID */}

        <div className="row g-3 mb-4">
          <div className="col-6 col-xl-3">
            <KpiCard
              title="Total GSTIN"
              value={summary.totalQueue}
              subtitle="Return defaulters requiring monitoring"
              icon={UserX}
              variant="primary"
              loading={loading}
            />
          </div>

          <div className="col-6 col-xl-3">
            <KpiCard
              title="Form GST 3A"
              value={summary.form3A}
              subtitle="30–89 days filing delay"
              icon={Clock3}
              variant="warning"
              loading={loading}
            />
          </div>

          <div className="col-6 col-xl-3">
            <KpiCard
              title="Critical Risk"
              value={summary.critical}
              subtitle="90+ days / critical risk"
              icon={ShieldAlert}
              variant="danger"
              loading={loading}
            />
          </div>

          <div className="col-6 col-xl-3">
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

        {/* RISK DISTRIBUTION */}

        <div className="card border-0 shadow-sm rounded-3 mb-4">
          <div className="card-body py-3">
            <div className="d-flex flex-column flex-md-row align-items-md-center gap-3">
              <div className="fw-bold text-dark small text-uppercase">
                Risk distribution
              </div>

              <div className="flex-grow-1">
                <div className="progress" style={{ height: 10 }}>
                  <div
                    className="progress-bar bg-danger"
                    style={{
                      width: `${
                        summary.totalQueue
                          ? (summary.critical / summary.totalQueue) * 100
                          : 0
                      }%`,
                    }}
                  />

                  <div
                    className="progress-bar bg-warning"
                    style={{
                      width: `${
                        summary.totalQueue
                          ? (summary.high / summary.totalQueue) * 100
                          : 0
                      }%`,
                    }}
                  />

                  <div
                    className="progress-bar bg-info"
                    style={{
                      width: `${
                        summary.totalQueue
                          ? (summary.form3A / summary.totalQueue) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              <div className="d-flex gap-3 small">
                <span>
                  <span className="text-danger fw-bold">
                    {summary.critical}
                  </span>{" "}
                  Critical
                </span>

                <span>
                  <span className="text-warning-emphasis fw-bold">
                    {summary.high}
                  </span>{" "}
                  High
                </span>

                <span>
                  <span className="text-info-emphasis fw-bold">
                    {summary.form3A}
                  </span>{" "}
                  Form 3A
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* DEFAULTER QUEUE */}

        <section className="card border-0 shadow-sm rounded-3 overflow-hidden">
          <div className="card-header bg-white border-bottom p-3">
            <div className="d-flex flex-column flex-xl-row justify-content-between gap-3">
              <div>
                <div className="Medium text-muted text-nowrap">
                 <h5 className="fw-bold text-dark mb-0 text-truncate">Return Defaulter Monitoring</h5>
                </div>
              </div>

              <div className="d-flex flex-wrap align-items-center gap-2">
                <div className="input-group input-group-sm" style={{ width: 270 }}>
                  <span className="input-group-text bg-white">
                    <Search size={14} className="text-muted" />
                  </span>

                  <input
                    type="search"
                    className="form-control"
                    placeholder="Search GSTIN..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPageNumber(0);
                    }}
                  />

                  {searchTerm && (
                    <button
                      type="button"
                      className="btn btn-light border"
                      onClick={() => setSearchTerm("")}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                <select
                  className="form-select form-select-sm"
                  style={{ width: 155 }}
                  value={riskFilter}
                  onChange={(e) => {
                    setRiskFilter(e.target.value);
                    setPageNumber(0);
                  }}
                >
                  <option value="ALL">All risk</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                </select>

                <button
                  type="button"
                  className={`btn btn-sm d-flex align-items-center gap-1 ${
                    showAdvanced ? "btn-primary" : "btn-outline-secondary"
                  }`}
                  onClick={() => setShowAdvanced((prev) => !prev)}
                >
                  <Filter size={14} />
                  Filters
                </button>

                {isFilterPending && (
                  <span className="small text-primary d-flex align-items-center gap-1">
                    <Loader2 size={13} className="spin" />
                    Filtering...
                  </span>
                )}
              </div>
            </div>
          </div>

          <TopLoadingBar active={loading} />

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
              <span className="small fw-bold text-muted">
                Active filters:
              </span>

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

              <button
                type="button"
                className="btn btn-link btn-sm text-danger p-0 ms-1"
                onClick={resetFilters}
              >
                Clear all
              </button>
            </div>
          )}

          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr className="official-table-header">
                  <th className="text-center">
                    Taxpayer
                  </th>

                  <th className="text-center">
                    Filing Delay
                  </th>

                  <th className="text-center">
                    Taxable Value
                  </th>

                  <th className="text-center">
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
                  Array.from({ length: pageSize }).map((_, index) => (
                    <SkeletonRow key={`skeleton-${index}`} />
                  ))
                ) : displayedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-5">
                      <div className="d-flex flex-column align-items-center justify-content-center text-center">
                        <div
                          className="bg-light text-muted rounded-circle d-flex align-items-center justify-content-center mb-3"
                          style={{ width: 56, height: 56 }}
                        >
                          <FilterX size={26} />
                        </div>

                        <div className="fw-bold text-dark">
                          No matching return defaulters found
                        </div>

                        <div className="small text-muted mt-1">
                          Try changing the period or filters.
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
                      key={`${row.gstin}-${row.retPeriod || selectedPeriod}-${index}`}
                      row={row}
                      retPeriod={selectedPeriod}
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
              disabled={loading || isFilterPending}
              onPageChange={setPageNumber}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPageNumber(0);
              }}
            />
          </div>
        </section>
      </main>

      <NoticeModal
        show={Boolean(modalRecord)}
        record={modalRecord}
        retPeriod={selectedPeriod}
        onClose={() => setModalRecord(null)}
        onSubmit={dispatchNotice}
        submitting={submittingNotice}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
