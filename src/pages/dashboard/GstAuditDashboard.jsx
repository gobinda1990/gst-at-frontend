import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useDeferredValue,
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
  Eye,
  FileCheck2,
  FileText,
  Filter,
  FilterX,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from "lucide-react";

import {
  fetchDashboardMetrics,
  refreshDashboardCache,
  fetchScrutinyPipeline,
  issueAsmt10Notice,
  fetchAllReturnPeriods,
} from "../../services/dashboardService";

import "./GstReturnDefaulterDashboard.css";

/* =========================================================
   CONFIGURATION
========================================================= */

const DEFAULT_PAGE_SIZE = 10;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Used only when the metrics call can't tell us how many records actually
// exist for the period (e.g. it errors, or the field is missing). This is
// a safety ceiling, not the normal path — the normal path sizes the fetch
// exactly to the known record count (see fetchAuditData below), so
// datasets of any size (500k+, 1M+) are retrieved in full without a
// hardcoded guess silently truncating them.
const FALLBACK_SERVER_FETCH_SIZE = 750000;

// Small buffer added on top of the known total, in case a handful of new
// records land between the metrics call and the pipeline call.
const FETCH_SIZE_BUFFER = 200;

const RISK_CONFIG = {
  CRITICAL: {
    label: "Critical",
    badge: "bg-danger-subtle text-danger border-danger-subtle",
    text: "text-danger",
    border: "border-danger",
  },
  HIGH: {
    label: "High",
    badge: "bg-warning-subtle text-warning-emphasis border-warning-subtle",
    text: "text-warning-emphasis",
    border: "border-warning",
  },
  MEDIUM: {
    label: "Medium",
    badge: "bg-info-subtle text-info-emphasis border-info-subtle",
    text: "text-info-emphasis",
    border: "border-info",
  },
  LOW: {
    label: "Low",
    badge: "bg-success-subtle text-success border-success-subtle",
    text: "text-success",
    border: "border-success",
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

const formatPercent = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number)) return "0%";

  return `${number.toFixed(number % 1 === 0 ? 0 : 1)}%`;
};

const formatPeriodLabel = (item) => {
  if (!item) return "";

  const value = typeof item === "object" ? item.value : String(item);

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
  String(row?.officerRiskCategory || row?.riskCategory || "MEDIUM").toUpperCase();

const getReason = (row) =>
  row?.asmt10Reason ||
  row?.groundReason ||
  "Discrepancy identified during return scrutiny.";

const getNoticeStatus = (row) => {
  if (
    row?.noticeIssued === true ||
    row?.asmt10Issued === true ||
    row?.noticeStatus === "ISSUED"
  ) {
    return "ISSUED";
  }

  return "PENDING";
};

/**
 * Runs once per record when a fetch completes rather than on every
 * filter/search pass. At 500k+ rows, recomputing these on every keystroke
 * (as the previous version did inside the filter) is the single biggest
 * source of input lag — this makes filtering a set of cheap property
 * reads instead of a set of string/boolean derivations per row per pass.
 */
const enrichRecord = (row) => {
  const delay = Number(row.filingDelayDays) || 0;
  const score = Number(row.riskScorePct) || 0;
  const itcRatio = Number(row.itcUtilizationPct) || 0;

  return {
    ...row,
    _risk: getRiskCategory(row),
    _reason: getReason(row),
    _noticeStatus: getNoticeStatus(row),
    _gstinLower: String(row.gstin || "").toLowerCase(),
    _delay: delay,
    _score: score,
    _itcRatio: itcRatio,
  };
};

const csvEscape = (value) => {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
};

/* =========================================================
   CSV EXPORT
========================================================= */

const buildCSV = (data) => {
  const headers = [
    "GSTIN",
    "Tax Period",
    "Risk Classification",
    "Risk Score (%)",
    "Output Tax Liability (INR)",
    "Eligible ITC (INR)",
    "Utilized ITC (INR)",
    "ITC Utilization (%)",
    "Excess ITC (INR)",
    "Filing Delay (Days)",
    "Notice Status",
    "Scrutiny Grounds",
  ];

  const rows = data.map((row) => [
    csvEscape(row.gstin),
    csvEscape(formatPeriodLabel(row.taxPeriod || row.retPeriod)),
    csvEscape(row._risk || getRiskCategory(row)),
    row.riskScorePct || 0,
    row.totalOutputTax || 0,
    row.eligibleItc || 0,
    row.utilizedItc || 0,
    row.itcUtilizationPct || 0,
    row.excessItc || 0,
    row.filingDelayDays || 0,
    csvEscape(row._noticeStatus || getNoticeStatus(row)),
    csvEscape(row._reason || getReason(row)),
  ]);

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
};

// Exporting hundreds of thousands of rows builds a multi-megabyte string;
// doing that synchronously inside a click handler can freeze the tab for
// a moment. Deferring the build one tick lets the "Preparing export..."
// toast actually paint first, so the UI doesn't look frozen while it works.
const exportToCSVAsync = (data, filename, onDone, onError) => {
  if (!Array.isArray(data) || data.length === 0) {
    onError?.("There are no records available for export.");
    return;
  }

  setTimeout(() => {
    try {
      const csv = buildCSV(data);

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = filename;

      document.body.appendChild(link);
      link.click();

      document.body.removeChild(link);

      URL.revokeObjectURL(url);

      onDone?.(data.length);
    } catch (err) {
      onError?.(err?.message || "Failed to build the export file.");
    }
  }, 0);
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
      const selected = options.find((item) => {
        const val = typeof item === "object" ? item.value : String(item);

        return val === value;
      });

      return selected ? formatPeriodLabel(selected) : value || "Select period";
    }, [options, value]);

    const filteredOptions = useMemo(() => {
      const query = search.trim().toLowerCase();

      if (!query) return options;

      return options.filter((item) => {
        const val = typeof item === "object" ? String(item.value) : String(item);

        const label = formatPeriodLabel(item);

        return val.toLowerCase().includes(query) || label.toLowerCase().includes(query);
      });
    }, [options, search]);

    return (
      <div ref={containerRef} className="position-relative" style={{ minWidth: 210 }}>
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
                filteredOptions.map((item) => {
                  const val = typeof item === "object" ? item.value : String(item);

                  const selected = val === value;

                  return (
                    <button
                      key={val}
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
      success: { border: "border-success", icon: "bg-success-subtle text-success" },
      dark: { border: "border-dark", icon: "bg-dark-subtle text-dark" },
    };

    const style = styles[variant] || styles.primary;

    return (
      <div
        className={`card h-100 border-0 border-start border-4 ${style.border} shadow-sm rounded-3`}
      >
        <div className="card-body p-3">
          <div className="d-flex justify-content-between align-items-start">
            <div className="min-w-0">
              <div className="text-uppercase text-muted fw-bold small">{title}</div>

              <div className="fs-3 fw-bold text-dark mt-1">
                {loading ? (
                  <span className="placeholder-glow">
                    <span className="placeholder col-7" style={{ height: 30 }} />
                  </span>
                ) : (
                  formatNumber(value)
                )}
              </div>

              {subtitle && <div className="small text-muted mt-1">{subtitle}</div>}
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
   RISK BADGE
========================================================= */

const RiskBadge = React.memo(({ category, score }) => {
  const config = RISK_CONFIG[category] || RISK_CONFIG.MEDIUM;

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
   NOTICE MODAL
========================================================= */

const NoticeModal = React.memo(
  ({ show, record, onClose, onSubmit, submitting }) => {
    const [reason, setReason] = useState("");
    const [section, setSection] = useState("Section 61");

    useEffect(() => {
      if (!record) return;

      setReason(record._reason || getReason(record));
      setSection("Section 61");
    }, [record]);

    if (!show || !record) {
      return null;
    }

    const riskCategory = record._risk || getRiskCategory(record);

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
                <FileCheck2 size={20} className="text-warning" />

                <div>
                  <h5 className="modal-title fw-bold mb-0">Issue ASMT-10 Notice</h5>

                  <div className="small opacity-75 mt-1">
                    Return scrutiny / discrepancy workflow
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
                      {formatPeriodLabel(record.taxPeriod || record.retPeriod)}
                    </div>
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="bg-white border rounded-3 p-3">
                    <div className="small text-muted text-uppercase fw-bold">
                      Risk
                    </div>

                    <div className="mt-1">
                      <RiskBadge category={riskCategory} score={record.riskScorePct} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="row g-3 mb-3">
                <div className="col-md-3">
                  <div className="bg-white border rounded-3 p-3">
                    <div className="small text-muted">Output Tax</div>

                    <div className="fw-bold mt-1">
                      {formatCurrency(record.totalOutputTax)}
                    </div>
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="bg-white border rounded-3 p-3">
                    <div className="small text-muted">Eligible ITC</div>

                    <div className="fw-bold mt-1">
                      {formatCurrency(record.eligibleItc)}
                    </div>
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="bg-white border rounded-3 p-3">
                    <div className="small text-muted">Utilized ITC</div>

                    <div className="fw-bold mt-1">
                      {formatCurrency(record.utilizedItc)}
                    </div>
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="bg-white border rounded-3 p-3">
                    <div className="small text-muted">Excess ITC</div>

                    <div
                      className={`fw-bold mt-1 ${
                        Number(record.excessItc) > 0 ? "text-danger" : "text-success"
                      }`}
                    >
                      {formatCurrency(record.excessItc)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label small fw-bold">
                  Statutory provision
                </label>

                <select
                  className="form-select"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  disabled={submitting}
                >
                  <option value="Section 61">
                    Section 61 - Scrutiny of Returns
                  </option>

                  <option value="Section 73">
                    Section 73 - Determination of Tax
                  </option>

                  <option value="Section 74">
                    Section 74 - Fraud / Wilful Misstatement
                  </option>
                </select>
              </div>

              <div className="mb-2">
                <label className="form-label small fw-bold">
                  Scrutiny findings / grounds
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
                  Please verify the taxpayer, return period and scrutiny grounds
                  before dispatching the notice.
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
                    retPeriod: record.taxPeriod || record.retPeriod,
                    section,
                    reason: reason.trim(),
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
   ADVANCED FILTER PANEL
========================================================= */

const AdvancedFilters = React.memo(
  ({
    show,
    minRiskScore,
    setMinRiskScore,
    maxDelay,
    setMaxDelay,
    noticeStatus,
    setNoticeStatus,
    onReset,
  }) => {
    if (!show) return null;

    return (
      <div className="border-top bg-light px-3 py-3">
        <div className="row g-3 align-items-end">
          <div className="col-md-3">
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

          <div className="col-md-3">
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

          <div className="col-md-3">
            <label className="form-label small fw-bold text-muted">
              Notice Status
            </label>

            <select
              className="form-select form-select-sm"
              value={noticeStatus}
              onChange={(e) => setNoticeStatus(e.target.value)}
            >
              <option value="ALL">All Status</option>
              <option value="PENDING">Notice Pending</option>
              <option value="ISSUED">Notice Issued</option>
            </select>
          </div>

          <div className="col-md-3">
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
   TOP LOADING BAR
========================================================= */

const TopLoadingBar = React.memo(({ active }) => {
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

      <style>{`
        @keyframes topbar-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </>
  );
});

/* =========================================================
   SKELETON ROW
========================================================= */

const SkeletonRow = React.memo(() => (
  <tr>
    <td className="ps-3">
      <span className="placeholder-glow d-inline-block" style={{ width: "70%" }}>
        <span className="placeholder col-12 rounded-1" style={{ height: 14 }} />
      </span>
      <span className="placeholder-glow d-inline-block mt-2" style={{ width: "45%" }}>
        <span className="placeholder col-12 rounded-1" style={{ height: 10 }} />
      </span>
    </td>

    <td className="text-end">
      <span className="placeholder-glow d-inline-block" style={{ width: "70%" }}>
        <span className="placeholder col-12 rounded-1" style={{ height: 14 }} />
      </span>
    </td>

    <td className="text-end">
      <span className="placeholder-glow d-inline-block" style={{ width: "70%" }}>
        <span className="placeholder col-12 rounded-1" style={{ height: 14 }} />
      </span>
    </td>

    <td className="text-end">
      <span className="placeholder-glow d-inline-block" style={{ width: "70%" }}>
        <span className="placeholder col-12 rounded-1" style={{ height: 14 }} />
      </span>
    </td>

    <td className="text-end">
      <span className="placeholder-glow d-inline-block" style={{ width: "65%" }}>
        <span className="placeholder col-12 rounded-1" style={{ height: 14 }} />
      </span>
    </td>

    <td className="text-center">
      <span className="placeholder-glow d-inline-block" style={{ width: 75 }}>
        <span className="placeholder col-12 rounded-1" style={{ height: 14 }} />
      </span>
    </td>

    <td>
      <span className="placeholder-glow d-inline-block" style={{ width: 80 }}>
        <span className="placeholder col-12 rounded-pill" style={{ height: 20 }} />
      </span>
      <span className="placeholder-glow d-inline-block mt-1" style={{ width: 60 }}>
        <span className="placeholder col-12 rounded-1" style={{ height: 10 }} />
      </span>
    </td>

    <td className="text-center">
      <span className="placeholder-glow d-inline-block" style={{ width: 84 }}>
        <span className="placeholder col-12 rounded-pill" style={{ height: 22 }} />
      </span>
    </td>

    <td>
      <span className="placeholder-glow d-inline-block" style={{ width: "90%" }}>
        <span className="placeholder col-12 rounded-1" style={{ height: 14 }} />
      </span>
    </td>

    <td className="pe-3 text-end">
      <span className="placeholder-glow d-inline-block" style={{ width: 80 }}>
        <span className="placeholder col-12 rounded-2" style={{ height: 30 }} />
      </span>
    </td>
  </tr>
));

/* =========================================================
   TABLE ROW
========================================================= */

const ScrutinyRow = React.memo(({ row, onNotice, onView }) => {
  const riskCategory = row._risk || getRiskCategory(row);

  const reason = row._reason || getReason(row);

  const noticeStatus = row._noticeStatus || getNoticeStatus(row);

  const delay = row._delay ?? 0;

  const itcRatio = row._itcRatio ?? 0;

  return (
    <tr>
      <td className="ps-3">
        <div className="fw-bold font-monospace text-dark">
          {row.gstin || "-"}
        </div>

        <div className="small text-muted mt-1">
          {formatPeriodLabel(row.taxPeriod || row.retPeriod)}
        </div>
      </td>

      <td className="text-end">
        <div className="fw-semibold font-monospace">
          {formatCurrency(row.totalOutputTax)}
        </div>

        <div className="small text-muted">Output liability</div>
      </td>

      <td className="text-end">
        <div className="fw-semibold font-monospace">
          {formatCurrency(row.eligibleItc)}
        </div>

        <div className="small text-muted">Eligible ITC</div>
      </td>

      <td className="text-end">
        <div className="fw-semibold font-monospace">
          {formatCurrency(row.utilizedItc)}
        </div>

        <div className="small text-muted">ITC utilized</div>
      </td>

      <td className="text-end">
        <span
          className={
            Number(row.excessItc) > 0
              ? "fw-bold text-danger"
              : "text-muted"
          }
        >
          {formatCurrency(row.excessItc)}
        </span>
      </td>

      <td className="text-center">
        <div
          className={`fw-bold ${
            itcRatio >= 99
              ? "text-danger"
              : itcRatio >= 90
              ? "text-warning-emphasis"
              : "text-dark"
          }`}
        >
          {formatPercent(itcRatio)}
        </div>

        <div
          className="progress mt-1"
          style={{
            width: 75,
            height: 5,
            margin: "0 auto",
          }}
        >
          <div
            className={`progress-bar ${
              itcRatio >= 99
                ? "bg-danger"
                : itcRatio >= 90
                ? "bg-warning"
                : "bg-primary"
            }`}
            style={{
              width: `${Math.min(Math.max(itcRatio, 0), 100)}%`,
            }}
          />
        </div>
      </td>

      <td>
        <RiskBadge
          category={riskCategory}
          score={row.riskScorePct}
        />
      </td>

      <td className="text-center">
        {delay > 0 ? (
          <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-2">
            <Clock3 size={12} className="me-1" />
            {delay} days
          </span>
        ) : (
          <span className="badge bg-success-subtle text-success border border-success-subtle rounded-2">
            <CheckCircle2 size={12} className="me-1" />
            On time
          </span>
        )}
      </td>

      <td>
        <div
          className="small text-secondary"
          style={{
            maxWidth: 230,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
          title={reason}
        >
          {reason}
        </div>
      </td>

      <td className="pe-3 text-end">
        <div className="d-flex justify-content-end gap-1">
          <button
            type="button"
            className="btn btn-sm btn-light border"
            title="View details"
            onClick={() => onView(row)}
          >
            <Eye size={14} />
          </button>

          {noticeStatus === "ISSUED" ? (
            <span className="btn btn-sm btn-success disabled">
              <CheckCircle2 size={14} className="me-1" />
              Issued
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-primary d-flex align-items-center gap-1"
              onClick={() => onNotice(row)}
            >
              <Send size={13} />
              Notice
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

/* =========================================================
   PAGINATION BAR
========================================================= */

/**
 * Builds a compact list of page numbers to render, always including the
 * first and last page, the pages immediately around the current page, and
 * "…" placeholders for any gaps in between.
 */
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
            <label className="small text-muted mb-0" htmlFor="page-size-select">
              Rows per page
            </label>

            <select
              id="page-size-select"
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

        <nav aria-label="Scrutiny queue pagination">
          <ul className="pagination pagination-sm mb-0 flex-wrap justify-content-center">
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

export default function GstAuditDashboard() {
  const [periods, setPeriods] = useState([]);

  const [selectedPeriod, setSelectedPeriod] = useState("");

  const [data, setData] = useState([]);

  const [metrics, setMetrics] = useState(null);

  const [loading, setLoading] = useState(false);

  const [loadingLabel, setLoadingLabel] = useState("");

  const [periodsLoading, setPeriodsLoading] = useState(false);

  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");

  const [riskFilter, setRiskFilter] = useState("ALL");

  const [showAdvanced, setShowAdvanced] = useState(false);

  const [minRiskScore, setMinRiskScore] = useState("");

  const [maxDelay, setMaxDelay] = useState("");

  const [noticeStatus, setNoticeStatus] = useState("ALL");

  // Pagination is handled entirely client-side over the full, filtered
  // record set so it always reflects "all records" rather than just
  // whatever page the server last returned.
  const [pageNumber, setPageNumber] = useState(0);

  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [modalRecord, setModalRecord] = useState(null);

  const [detailRecord, setDetailRecord] = useState(null);

  const [submittingNotice, setSubmittingNotice] = useState(false);

  const [toast, setToast] = useState(null);

  const [exporting, setExporting] = useState(false);

  // Text/number inputs are deferred so typing itself never blocks on
  // filtering 500k+ rows — the input stays instantly responsive, and the
  // (potentially expensive) filtered list recomputes a frame or two later.
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const deferredMinRiskScore = useDeferredValue(minRiskScore);
  const deferredMaxDelay = useDeferredValue(maxDelay);

  const isFilterPending =
    searchTerm !== deferredSearchTerm ||
    minRiskScore !== deferredMinRiskScore ||
    maxDelay !== deferredMaxDelay;

  // Tracks the in-flight fetch so switching periods quickly (or unmounting)
  // cancels the previous request instead of letting a stale response land
  // after a newer one.
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

        if (Array.isArray(response) && response.length > 0) {
          setPeriods(response);

          const first = typeof response[0] === "object" ? response[0].value : response[0];

          setSelectedPeriod(first);
        }
      } catch (err) {
        if (err?.name !== "AbortError") {
          console.error("Failed to load return periods", err);
        }
      } finally {
        setPeriodsLoading(false);
      }
    };

    loadPeriods();

    return () => controller.abort();
  }, []);

  /* =====================================================
     FETCH DASHBOARD
     Strategy for large datasets (500k+ records):
       1. Fetch metrics first — it's cheap and tells us the real total
          record count for the period (totalScrutinyCount).
       2. Size the pipeline fetch exactly to that count (+ small buffer),
          instead of guessing a static page size that could either
          truncate a large dataset or over-fetch a small one.
       3. Fall back to a generous static ceiling only if the metrics
          response doesn't include a usable count.
     Pagination and search/filtering then run entirely client-side over
     that complete set (see displayedRecords / paginatedRecords below).
  ===================================================== */

  const fetchAuditData = useCallback(
    async (period, forceRefresh = false) => {
      if (!period) return;

      // Cancel any still-in-flight request for a previous period/refresh.
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
      }

      const controller = new AbortController();
      fetchControllerRef.current = controller;

      setLoading(true);
      setError(null);
      setLoadingLabel("Loading scrutiny data...");

      try {
        if (forceRefresh) {
          await refreshDashboardCache({ signal: controller.signal });
        }

        const metricsRes = await fetchDashboardMetrics({
          retPeriod: period,
          forceRefresh,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        setMetrics(metricsRes || null);

        const expectedTotal = Number(metricsRes?.totalScrutinyCount);

        const fetchSize =
          Number.isFinite(expectedTotal) && expectedTotal > 0
            ? expectedTotal + FETCH_SIZE_BUFFER
            : FALLBACK_SERVER_FETCH_SIZE;

        if (Number.isFinite(expectedTotal) && expectedTotal > 0) {
          setLoadingLabel(
            `Loading ${new Intl.NumberFormat("en-IN").format(
              expectedTotal
            )} records...`
          );
        }

        const pipelineRes = await fetchScrutinyPipeline({
          retPeriod: period,
          page: 0,
          size: fetchSize,
          riskCategory: "ALL",
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const records =
          pipelineRes?.content || (Array.isArray(pipelineRes) ? pipelineRes : []);

        // Enrich once here, not on every filter pass — see enrichRecord().
        setData(records.map(enrichRecord));
      } catch (err) {
        if (err?.name !== "CanceledError" && err?.name !== "AbortError") {
          setError(
            err?.response?.data?.message ||
              err?.message ||
              "Unable to load GST scrutiny data."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingLabel("");
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!selectedPeriod) return;

    fetchAuditData(selectedPeriod);

    return () => {
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod]);

  /* =====================================================
     CLIENT SIDE FILTER (over the full, precomputed record set)
  ===================================================== */

  const displayedRecords = useMemo(() => {
    const query = deferredSearchTerm.trim().toLowerCase();

    const minScore = deferredMinRiskScore === "" ? null : Number(deferredMinRiskScore);
    const maxDelayValue = deferredMaxDelay === "" ? null : Number(deferredMaxDelay);

    // Fast path: nothing to filter, skip the loop over the full array.
    if (
      !query &&
      riskFilter === "ALL" &&
      minScore === null &&
      maxDelayValue === null &&
      noticeStatus === "ALL"
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

      if (noticeStatus !== "ALL" && row._noticeStatus !== noticeStatus) {
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
    noticeStatus,
  ]);

  /* =====================================================
     CLIENT SIDE PAGINATION (over displayedRecords)
  ===================================================== */

  const totalElements = displayedRecords.length;

  const totalPages = Math.max(1, Math.ceil(totalElements / pageSize));

  // Reset to page 1 whenever the filtered set or page size changes so the
  // user never lands on a page that no longer exists.
  useEffect(() => {
    setPageNumber(0);
  }, [
    deferredSearchTerm,
    riskFilter,
    deferredMinRiskScore,
    deferredMaxDelay,
    noticeStatus,
    pageSize,
    selectedPeriod,
  ]);

  // Clamp defensively in case totalPages shrinks for any other reason.
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
    setNoticeStatus("ALL");
    setPageNumber(0);
  }, []);

  /* =====================================================
     NOTICE
  ===================================================== */

  const openNotice = useCallback((record) => {
    setModalRecord(record);
  }, []);

  const viewRecord = useCallback((record) => {
    setDetailRecord(record);
  }, []);

  const dispatchNotice = useCallback(
    async (payload) => {
      setSubmittingNotice(true);

      try {
        await issueAsmt10Notice({
          gstin: payload.gstin,
          retPeriod: payload.retPeriod,
          groundReason: payload.reason,
        });

        setModalRecord(null);

        setToast({
          type: "success",
          message: `ASMT-10 notice dispatched successfully for ${payload.gstin}.`,
        });

        await fetchAuditData(selectedPeriod);
      } catch (err) {
        setToast({
          type: "error",
          message:
            err?.response?.data?.message || err?.message || "Failed to issue ASMT-10 notice.",
        });
      } finally {
        setSubmittingNotice(false);
      }
    },
    [fetchAuditData, selectedPeriod]
  );

  /* =====================================================
     KPI VALUES
  ===================================================== */

  const totalCount = metrics?.totalScrutinyCount ?? data.length;

  const criticalCount =
    metrics?.criticalCount ?? data.filter((row) => row._risk === "CRITICAL").length;

  const highCount = metrics?.highCount ?? data.filter((row) => row._risk === "HIGH").length;

  const mediumCount =
    metrics?.mediumCount ?? data.filter((row) => row._risk === "MEDIUM").length;

  const pendingNoticeCount =
    metrics?.pendingNoticeCount ??
    data.filter((row) => row._noticeStatus === "PENDING").length;

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
      `GST_Scrutiny_${selectedPeriod}.csv`,
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
    <div className="min-vh-100" style={{ background: "#f4f6f9" }}>
      {/* =================================================
          OFFICE HEADER
      ================================================= */}

      <header
        className="bg-white border-bottom"
        style={{ position: "sticky", top: 0, zIndex: 1000 }}
      >
        <div className="container-fluid px-3 px-lg-4 py-3">
          <div className="d-flex flex-column flex-xl-row justify-content-between align-items-start align-items-xl-center gap-3">
            <div>
              <div className="d-flex align-items-center gap-2">
                <div
                  className="bg-primary text-white rounded-2 d-flex align-items-center justify-content-center"
                  style={{ width: 38, height: 38 }}
                >
                  <ShieldAlert size={20} />
                </div>

                <div>
                 <h5 className="mb-0 fw-bold text-dark text-nowrap">Taxpayer Risk &amp; Compliance Monitoring</h5>
                </div>
              </div>
            </div>

            <div className="d-flex flex-wrap align-items-center justify-content-end gap-2 w-100 w-xl-auto">
              <div className="flex-grow-1 flex-xl-grow-0" style={{ minWidth: 180 }}>
                <SearchablePeriodSelect
                  options={periods}
                  value={selectedPeriod}
                  loading={periodsLoading}
                  onChange={(value) => {
                    setSelectedPeriod(value);
                  }}
                />
              </div>

              <button
                type="button"
                className="btn btn-outline-success rounded-2 d-flex align-items-center justify-content-center gap-2 flex-grow-1 flex-xl-grow-0"
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
                className="btn btn-primary rounded-2 d-flex align-items-center justify-content-center gap-2 flex-grow-1 flex-xl-grow-0"
                disabled={loading || !selectedPeriod}
                onClick={() => fetchAuditData(selectedPeriod, true)}
              >
                <RefreshCw size={15} className={loading ? "spin" : ""} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container-fluid px-3 px-lg-4 py-4">
        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <div className="alert alert-danger border-0 shadow-sm d-flex align-items-start gap-2 rounded-3">
            <AlertTriangle size={18} className="mt-1" />

            <div className="flex-grow-1">
              <div className="fw-bold">Unable to load dashboard</div>

              <div className="small">{error}</div>
            </div>

            <button type="button" className="btn-close" onClick={() => setError(null)} />
          </div>
        )}

        {/* =================================================
            LOADING STATUS (visible while fetching 500k+ rows)
        ================================================= */}

        {loading && loadingLabel && (
          <div className="alert alert-info border-0 shadow-sm d-flex align-items-center gap-2 rounded-3 py-2">
            <Loader2 size={16} className="spin" />
            <div className="small fw-semibold">{loadingLabel}</div>
          </div>
        )}

        {/* =================================================
            KPI GRID
        ================================================= */}

        <div className="row g-3 mb-4">
          <div className="col-6 col-md-3">
            <KpiCard
              title="Total Cases"
              value={totalCount}
              subtitle="Scrutiny queue"
              icon={FileText}
              variant="primary"
              loading={loading}
            />
          </div>

          <div className="col-6 col-md-3">
            <KpiCard
              title="Critical"
              value={criticalCount}
              subtitle="Immediate attention"
              icon={ShieldAlert}
              variant="danger"
              loading={loading}
            />
          </div>

          <div className="col-6 col-md-3">
            <KpiCard
              title="High Risk"
              value={highCount}
              subtitle="Officer review"
              icon={AlertTriangle}
              variant="warning"
              loading={loading}
            />
          </div>

          <div className="col-6 col-md-3">
            <KpiCard
              title="Medium Risk"
              value={mediumCount}
              subtitle="Monitor"
              icon={SlidersHorizontal}
              variant="info"
              loading={loading}
            />
          </div>
        </div>

        {/* =================================================
            RISK SUMMARY BAR
        ================================================= */}

        <div className="card border-0 shadow-sm rounded-3 mb-4">
          <div className="card-body py-3">
            <div className="d-flex flex-column flex-md-row align-items-md-center gap-3">
              <div className="fw-bold text-dark small text-uppercase">Risk distribution</div>

              <div className="flex-grow-1">
                <div className="progress" style={{ height: 10 }}>
                  <div
                    className="progress-bar bg-danger"
                    style={{
                      width: `${totalCount ? (criticalCount / totalCount) * 100 : 0}%`,
                    }}
                  />

                  <div
                    className="progress-bar bg-warning"
                    style={{ width: `${totalCount ? (highCount / totalCount) * 100 : 0}%` }}
                  />

                  <div
                    className="progress-bar bg-info"
                    style={{
                      width: `${totalCount ? (mediumCount / totalCount) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div className="d-flex gap-3 small">
                <span>
                  <span className="text-danger fw-bold">{formatNumber(criticalCount)}</span>{" "}
                  Critical
                </span>

                <span>
                  <span className="text-warning-emphasis fw-bold">
                    {formatNumber(highCount)}
                  </span>{" "}
                  High
                </span>

                <span>
                  <span className="text-info-emphasis fw-bold">
                    {formatNumber(mediumCount)}
                  </span>{" "}
                  Medium
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* =================================================
            SCRUTINY QUEUE
        ================================================= */}

        <section className="card border-0 shadow-sm rounded-3 overflow-hidden">
          {/* Toolbar */}

          <div className="card-header bg-white border-bottom p-3">
            <div className="d-flex flex-column flex-xl-row justify-content-between align-items-start align-items-xl-center gap-3">
              <div>
                <h5 className="fw-bold text-dark mb-0 text-truncate">Review taxpayer discrepancies</h5>
              </div>

              <div className="d-flex flex-wrap align-items-center justify-content-end gap-2 w-100">
                {/* Search */}

                <div
                  className="input-group input-group-sm flex-grow-1 flex-xl-grow-0 position-relative"
                  style={{ minWidth: 200, maxWidth: 320 }}
                >
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
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
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

                {/* Risk */}

                <select
                  className="form-select form-select-sm flex-grow-1 flex-xl-grow-0"
                  style={{ minWidth: 120, maxWidth: 155 }}
                  value={riskFilter}
                  onChange={(e) => {
                    setRiskFilter(e.target.value);
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
            noticeStatus={noticeStatus}
            setNoticeStatus={setNoticeStatus}
            onReset={resetFilters}
          />

          {/* Active filter information */}

          {(searchTerm ||
            riskFilter !== "ALL" ||
            minRiskScore ||
            maxDelay ||
            noticeStatus !== "ALL") && (
            <div className="px-3 py-2 bg-light border-bottom d-flex flex-wrap align-items-center gap-2">
              <span className="small fw-bold text-muted">Active filters:</span>

              {searchTerm && (
                <span className="badge bg-white text-dark border">
                  GSTIN: {searchTerm}
                </span>
              )}

              {riskFilter !== "ALL" && (
                <span className="badge bg-white text-dark border">Risk: {riskFilter}</span>
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

              {noticeStatus !== "ALL" && (
                <span className="badge bg-white text-dark border">
                  Notice: {noticeStatus}
                </span>
              )}

              <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                {formatNumber(totalElements)} match{totalElements === 1 ? "" : "es"}
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

          {/* Table */}

          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr className="official-table-header">
                  <th className="ps-3 text-uppercase small fw-bold text-muted">Taxpayer</th>

                  <th className="text-end text-uppercase small fw-bold text-muted">
                    Output Tax
                  </th>

                  <th className="text-end text-uppercase small fw-bold text-muted">
                    Eligible ITC
                  </th>

                  <th className="text-end text-uppercase small fw-bold text-muted">
                    Utilized ITC
                  </th>

                  <th className="text-end text-uppercase small fw-bold text-muted">
                    Excess ITC
                  </th>

                  <th className="text-center text-uppercase small fw-bold text-muted">
                    ITC Ratio
                  </th>

                  <th className="text-uppercase small fw-bold text-muted">Risk</th>

                  <th className="text-center text-uppercase small fw-bold text-muted">
                    Filing
                  </th>

                  <th className="text-uppercase small fw-bold text-muted">
                    Scrutiny Ground
                  </th>

                  <th className="pe-3 text-end text-uppercase small fw-bold text-muted">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading && data.length === 0 ? (
                  Array.from({ length: pageSize }).map((_, index) => (
                    <SkeletonRow key={`skeleton-${index}`} />
                  ))
                ) : paginatedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-5">
                      <div className="d-flex flex-column align-items-center justify-content-center text-center">
                        <div
                          className="bg-light text-muted rounded-circle d-flex align-items-center justify-content-center mb-3"
                          style={{ width: 56, height: 56 }}
                        >
                          <FilterX size={26} />
                        </div>

                        <div className="fw-bold text-dark">No scrutiny records found</div>

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
                    <ScrutinyRow
                      key={row.id || `${row.gstin}-${row.taxPeriod || row.retPeriod}-${index}`}
                      row={row}
                      onNotice={openNotice}
                      onView={viewRecord}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer / Pagination */}

          <div className="card-footer bg-white border-top p-3">
            <PaginationBar
              pageNumber={pageNumber}
              totalPages={totalPages}
              totalRecords={totalElements}
              pageSize={pageSize}
              onPageChange={setPageNumber}
              onPageSizeChange={setPageSize}
              disabled={loading}
            />
          </div>
        </section>
      </main>

      {/* =================================================
          DETAILS MODAL
      ================================================= */}

      {detailRecord && (
        <div
          className="modal fade show d-block"
          style={{ background: "rgba(15,23,42,.65)" }}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 rounded-3 shadow-lg">
              <div className="modal-header">
                <div>
                  <h5 className="fw-bold mb-1">Taxpayer Scrutiny Details</h5>

                  <div className="small text-muted">{detailRecord.gstin}</div>
                </div>

                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setDetailRecord(null)}
                />
              </div>

              <div className="modal-body bg-light">
                <div className="row g-3">
                  <div className="col-md-6">
                    <div className="bg-white border rounded-3 p-3">
                      <div className="small text-muted">GSTIN</div>

                      <div className="font-monospace fw-bold mt-1">{detailRecord.gstin}</div>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="bg-white border rounded-3 p-3">
                      <div className="small text-muted">Return Period</div>

                      <div className="fw-bold mt-1">
                        {formatPeriodLabel(detailRecord.taxPeriod || detailRecord.retPeriod)}
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="bg-white border rounded-3 p-3">
                      <div className="small text-muted">Output Tax</div>

                      <div className="fw-bold mt-1">
                        {formatCurrency(detailRecord.totalOutputTax)}
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="bg-white border rounded-3 p-3">
                      <div className="small text-muted">Eligible ITC</div>

                      <div className="fw-bold mt-1">
                        {formatCurrency(detailRecord.eligibleItc)}
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="bg-white border rounded-3 p-3">
                      <div className="small text-muted">Utilized ITC</div>

                      <div className="fw-bold mt-1">
                        {formatCurrency(detailRecord.utilizedItc)}
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="bg-white border rounded-3 p-3">
                      <div className="small text-muted">Excess ITC</div>

                      <div className="fw-bold text-danger mt-1">
                        {formatCurrency(detailRecord.excessItc)}
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="bg-white border rounded-3 p-3">
                      <div className="small text-muted">Filing Delay</div>

                      <div className="fw-bold mt-1">
                        {Number(detailRecord.filingDelayDays) || 0} days
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="bg-white border rounded-3 p-3">
                      <div className="small text-muted">ITC Utilization</div>

                      <div className="fw-bold mt-1">
                        {formatPercent(detailRecord.itcUtilizationPct)}
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="bg-white border rounded-3 p-3">
                      <div className="small text-muted">Notice Status</div>

                      <div className="fw-bold mt-1">
                        {detailRecord._noticeStatus || getNoticeStatus(detailRecord)}
                      </div>
                    </div>
                  </div>

                  <div className="col-12">
                    <div className="bg-white border rounded-3 p-3">
                      <div className="small text-muted mb-2">Scrutiny Grounds</div>

                      <div className="text-dark small">
                        {detailRecord._reason || getReason(detailRecord)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDetailRecord(null)}
                >
                  Close
                </button>

                {(detailRecord._noticeStatus || getNoticeStatus(detailRecord)) !== "ISSUED" && (
                  <button
                    type="button"
                    className="btn btn-primary d-flex align-items-center gap-2"
                    onClick={() => {
                      setDetailRecord(null);
                      openNotice(detailRecord);
                    }}
                  >
                    <Send size={14} />
                    Issue Notice
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================
          NOTICE MODAL
      ================================================= */}

      <NoticeModal
        show={Boolean(modalRecord)}
        record={modalRecord}
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
