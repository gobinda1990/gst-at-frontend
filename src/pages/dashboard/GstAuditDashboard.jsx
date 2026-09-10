
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

import "./GstAuditDashboard.css";

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

const formatPeriodLabel = (item) => {
  if (!item) {
    return "";
  }

  const value =
    typeof item === "object"
      ? String(item.value ?? "")
      : String(item);

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

const getRiskCategory = (row) => {
  const category = String(
    row?.officerRiskCategory ||
    row?.riskCategory ||
    "MEDIUM"
  ).toUpperCase();

  return RISK_CONFIG[category] ? category : "MEDIUM";
};

const getReason = (row) =>
  row?.asmt10Reason ||
  row?.groundReason ||
  row?.scrutinyReason ||
  "Discrepancy identified during return scrutiny.";

const getNoticeStatus = (row) => {
  if (
    row?.noticeIssued === true ||
    row?.asmt10Issued === true ||
    String(row?.noticeStatus || "").toUpperCase() === "ISSUED"
  ) {
    return "ISSUED";
  }

  return "PENDING";
};

const getReturnPeriod = (row) =>
  row?.taxPeriod || row?.retPeriod || "";

const getRiskScore = (row) =>
  toNumber(
    row?.riskScorePct ??
    row?.finalRiskScore ??
    row?.riskScore
  );

const getItcUtilization = (row) =>
  toNumber(
    row?.itcUtilizationPct ??
    row?.itcUtilizationPercent
  );

const getExcessItc = (row) =>
  toNumber(
    row?.excessItc ??
    row?.potentialExcessItc
  );

/* =========================================================
   RECORD ENRICHMENT
========================================================= */

const enrichRecord = (row) => {
  const delay = Math.max(
    0,
    toNumber(row?.filingDelayDays)
  );

  const score = Math.max(
    0,
    Math.min(100, getRiskScore(row))
  );

  const itcRatio = Math.max(
    0,
    getItcUtilization(row)
  );

  const risk = getRiskCategory(row);

  return {
    ...row,

    _risk: risk,

    _reason: getReason(row),

    _noticeStatus: getNoticeStatus(row),

    _gstinLower: String(
      row?.gstin || ""
    ).toLowerCase(),

    _delay: delay,

    _score: score,

    _itcRatio: itcRatio,

    _period: getReturnPeriod(row),

    _excessItc: getExcessItc(row),
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
    csvEscape(
      formatPeriodLabel(row._period)
    ),
    csvEscape(row._risk),
    row._score,
    toNumber(row.totalOutputTax),
    toNumber(row.eligibleItc),
    toNumber(row.utilizedItc),
    row._itcRatio,
    row._excessItc,
    row._delay,
    csvEscape(row._noticeStatus),
    csvEscape(row._reason),
  ]);

  return [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");
};

const exportToCSVAsync = (
  data,
  filename,
  onDone,
  onError
) => {
  if (!Array.isArray(data) || data.length === 0) {
    onError?.(
      "There are no records available for export."
    );
    return;
  }

  setTimeout(() => {
    try {
      const csv = buildCSV(data);

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

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);

      onDone?.(data.length);
    } catch (error) {
      onError?.(
        error?.message ||
        "Failed to build the export file."
      );
    }
  }, 0);
};

/* =========================================================
   TOAST
========================================================= */

const Toast = React.memo(
  ({ toast, onClose }) => {
    if (!toast) {
      return null;
    }

    const isError =
      toast.type === "error";

    return (
      <div
        className="position-fixed top-0 end-0 p-3"
        style={{ zIndex: 3000 }}
      >
        <div
          className={`toast show border-0 shadow-lg ${isError
            ? "bg-danger"
            : "bg-dark"
            } text-white`}
          role="alert"
          style={{ minWidth: 330 }}
        >
          <div className="d-flex align-items-start p-3">
            {isError ? (
              <AlertCircle
                size={20}
                className="me-2 mt-1"
              />
            ) : (
              <CheckCircle2
                size={20}
                className="me-2 mt-1"
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

const SearchablePeriodSelect = React.memo(
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
      const handleOutside = (event) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(
            event.target
          )
        ) {
          setOpen(false);
        }
      };

      const handleKeyDown = (event) => {
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
          options.find((item) => {
            const itemValue =
              typeof item === "object"
                ? String(item.value)
                : String(item);

            return itemValue === value;
          });

        return selected
          ? formatPeriodLabel(selected)
          : value || "Select period";
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
            const itemValue =
              typeof item === "object"
                ? String(item.value)
                : String(item);

            const label =
              formatPeriodLabel(item);

            return (
              itemValue
                .toLowerCase()
                .includes(query) ||
              label
                .toLowerCase()
                .includes(query)
            );
          }
        );
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
          onClick={() =>
            setOpen((previous) => !previous)
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
              className="ms-2 period-chevron"
              style={{
                transform: open
                  ? "rotate(180deg)"
                  : "none",
              }}
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
                onChange={(event) =>
                  setSearch(event.target.value)
                }
              />
            </div>

            <div
              className="overflow-auto"
              style={{ maxHeight: 230 }}
            >
              {filteredOptions.length ===
                0 ? (
                <div className="text-center text-muted small py-4">
                  No period found
                </div>
              ) : (
                filteredOptions.map(
                  (item) => {
                    const itemValue =
                      typeof item ===
                        "object"
                        ? String(
                          item.value
                        )
                        : String(item);

                    const selected =
                      itemValue === value;

                    return (
                      <button
                        key={itemValue}
                        type="button"
                        className={`dropdown-item rounded-2 d-flex justify-content-between align-items-center py-2 ${selected
                          ? "active"
                          : ""
                          }`}
                        onClick={() => {
                          onChange(
                            itemValue
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

  const theme =
    themes[variant] || themes.primary;

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

        {/* Accent bar */}
        <div className="gst-kpi-accent-bar" />

        {/* Icon */}
        <div className="gst-kpi-icon">
          {loading ? (
            <Loader2
              size={18}
              className="spin"
            />
          ) : (
            <Icon size={18} strokeWidth={2.2} />
          )}
        </div>

        {/* Content */}
        <div className="gst-kpi-content">

          <div className="gst-kpi-title">
            {title}
          </div>

          {loading ? (
            <div className="gst-kpi-loading-value">
              Loading...
            </div>
          ) : (
            <div
              className="gst-kpi-value"
              title={String(value)}
            >
              {formatNumber(value)}
            </div>
          )}

          <div
            className="gst-kpi-subtitle"
            title={subtitle}
          >
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

const RiskBadge = React.memo(
  ({ category, score }) => {
    const normalized =
      RISK_CONFIG[category]
        ? category
        : "MEDIUM";

    const config =
      RISK_CONFIG[normalized];

    return (
      <div className="d-inline-flex flex-column align-items-start">
        <span
          className={`badge border rounded-2 px-2 py-1 ${config.badge}`}
        >
          {config.label}
        </span>

        <span
          className={`small fw-semibold mt-1 ${config.text}`}
        >
          Score: {formatPercent(score)}
        </span>
      </div>
    );
  }
);

/* =========================================================
   NOTICE MODAL
========================================================= */

const NoticeModal = React.memo(
  ({
    show,
    record,
    onClose,
    onSubmit,
    submitting,
  }) => {
    const [reason, setReason] =
      useState("");

    const [section, setSection] =
      useState("Section 61");

    useEffect(() => {
      if (!record) {
        return;
      }

      setReason(
        record._reason ||
        getReason(record)
      );

      setSection("Section 61");
    }, [record]);

    if (!show || !record) {
      return null;
    }

    const riskCategory =
      record._risk ||
      getRiskCategory(record);

    const period =
      record._period ||
      getReturnPeriod(record);

    const excessItc =
      record._excessItc ??
      getExcessItc(record);

    return (
      <div
        className="modal fade show d-block"
        role="dialog"
        aria-modal="true"
        style={{
          backgroundColor:
            "rgba(15, 23, 42, 0.65)",
        }}
      >
        <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
          <div className="modal-content border-0 shadow-lg rounded-3 overflow-hidden">
            <div className="modal-header bg-dark text-white px-4 py-3">
              <div className="d-flex align-items-center gap-2">
                <FileCheck2
                  size={20}
                  className="text-warning"
                />

                <div>
                  <h5 className="modal-title fw-bold mb-0">
                    Issue ASMT-10 Notice
                  </h5>

                  <div className="small opacity-75 mt-1">
                    Return scrutiny /
                    discrepancy workflow
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
                      {record.gstin ||
                        "-"}
                    </div>
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="bg-white border rounded-3 p-3 h-100">
                    <div className="small text-muted text-uppercase fw-bold">
                      Period
                    </div>

                    <div className="fw-bold mt-1">
                      {formatPeriodLabel(
                        period
                      )}
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
                        category={
                          riskCategory
                        }
                        score={getRiskScore(
                          record
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="row g-3 mb-3">
                <div className="col-md-3">
                  <div className="bg-white border rounded-3 p-3">
                    <div className="small text-muted">
                      Output Tax
                    </div>

                    <div className="fw-bold mt-1">
                      {formatCurrency(
                        record.totalOutputTax
                      )}
                    </div>
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="bg-white border rounded-3 p-3">
                    <div className="small text-muted">
                      Eligible ITC
                    </div>

                    <div className="fw-bold mt-1">
                      {formatCurrency(
                        record.eligibleItc
                      )}
                    </div>
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="bg-white border rounded-3 p-3">
                    <div className="small text-muted">
                      Utilized ITC
                    </div>

                    <div className="fw-bold mt-1">
                      {formatCurrency(
                        record.utilizedItc
                      )}
                    </div>
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="bg-white border rounded-3 p-3">
                    <div className="small text-muted">
                      Potential Excess
                    </div>

                    <div
                      className={`fw-bold mt-1 ${excessItc > 0
                        ? "text-danger"
                        : "text-success"
                        }`}
                    >
                      {formatCurrency(
                        excessItc
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="alert alert-info border-0 small">
                <strong>Analytical caution:</strong>{" "}
                Potential excess ITC is a
                scrutiny signal generated
                from return data. It should
                be verified against applicable
                records and statutory
                provisions before issuing a
                notice.
              </div>

              <div className="mb-3">
                <label
                  className="form-label small fw-bold"
                  htmlFor="notice-section"
                >
                  Statutory provision
                </label>

                <select
                  id="notice-section"
                  className="form-select"
                  value={section}
                  onChange={(event) =>
                    setSection(
                      event.target.value
                    )
                  }
                  disabled={submitting}
                >
                  <option value="Section 61">
                    Section 61 - Scrutiny of
                    Returns
                  </option>

                  <option value="Section 73">
                    Section 73 - Determination
                    of Tax
                  </option>

                  <option value="Section 74">
                    Section 74 - Fraud /
                    Wilful Misstatement
                  </option>
                </select>
              </div>

              <div className="mb-2">
                <label
                  className="form-label small fw-bold"
                  htmlFor="scrutiny-reason"
                >
                  Scrutiny findings / grounds
                </label>

                <textarea
                  id="scrutiny-reason"
                  rows={6}
                  className="form-control"
                  value={reason}
                  onChange={(event) =>
                    setReason(
                      event.target.value
                    )
                  }
                  disabled={submitting}
                  maxLength={
                    MAX_REASON_LENGTH
                  }
                />

                <div className="text-end text-muted small mt-1">
                  {reason.length}/
                  {MAX_REASON_LENGTH}
                </div>
              </div>

              <div className="alert alert-warning d-flex gap-2 align-items-start small mb-0">
                <AlertTriangle
                  size={17}
                  className="flex-shrink-0 mt-1"
                />

                <div>
                  Please verify the taxpayer,
                  return period and scrutiny
                  grounds before dispatching
                  the notice.
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
                disabled={
                  submitting ||
                  !reason.trim()
                }
                onClick={() =>
                  onSubmit({
                    gstin:
                      record.gstin,
                    retPeriod: period,
                    section,
                    reason:
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
    noticeStatus,
    setNoticeStatus,
    onReset,
  }) => {
    if (!show) {
      return null;
    }

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
              onChange={(event) =>
                setMinRiskScore(
                  event.target.value
                )
              }
              placeholder="0 - 100"
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
              onChange={(event) =>
                setMaxDelay(
                  event.target.value
                )
              }
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
              onChange={(event) =>
                setNoticeStatus(
                  event.target.value
                )
              }
            >
              <option value="ALL">
                All Status
              </option>

              <option value="PENDING">
                Notice Pending
              </option>

              <option value="ISSUED">
                Notice Issued
              </option>
            </select>
          </div>

          <div className="col-md-3">
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
  }
);

/* =========================================================
   LOADING BAR
========================================================= */

const TopLoadingBar = React.memo(
  ({ active }) => {
    if (!active) {
      return null;
    }

    return (
      <div className="gst-loading-bar">
        <div className="gst-loading-bar-progress" />
      </div>
    );
  }
);

/* =========================================================
   SKELETON
========================================================= */

const SkeletonRow = React.memo(
  () => (
    <tr className="skeleton-row">
      <td className="ps-3">
        <span className="placeholder-glow d-inline-block w-75">
          <span
            className="placeholder col-12 rounded-1"
            style={{ height: 14 }}
          />
        </span>

        <span className="placeholder-glow d-inline-block mt-2 w-50">
          <span
            className="placeholder col-12 rounded-1"
            style={{ height: 10 }}
          />
        </span>
      </td>

      {Array.from({
        length: 9,
      }).map((_, index) => (
        <td
          key={index}
          className={
            index === 4 ||
              index === 6
              ? "text-center"
              : "text-end"
          }
        >
          <span className="placeholder-glow d-inline-block w-75">
            <span
              className="placeholder col-12 rounded-1"
              style={{
                height:
                  index === 6
                    ? 22
                    : 14,
              }}
            />
          </span>
        </td>
      ))}
    </tr>
  )
);

/* =========================================================
   TABLE ROW
========================================================= */

const ScrutinyRow = ({
  row,
  onNotice,
  onView,
}) => {
  const risk = row._risk || getRiskCategory(row);
  const riskConfig =
    RISK_CONFIG[risk] || RISK_CONFIG.MEDIUM;

  const reason =
    row._reason || getReason(row);

  const noticeStatus =
    row._noticeStatus || getNoticeStatus(row);

  const delay = Number(row._delay ?? row.filingDelayDays ?? 0);

  const score = Number(
    row._score ??
    row.riskScorePct ??
    row.finalRiskScore ??
    0
  );

  const itcRatio = Number(
    row._itcRatio ??
    row.itcUtilizationPct ??
    row.itcUtilizationPercent ??
    0
  );

  const period =
    row._period ||
    row.retPeriod ||
    "";

  return (
    <tr className="gst-data-row">

      {/* Taxpayer */}
      <td className="taxpayer-cell text-center">

        <div className="gstin-value">
          {row.gstin || "-"}
        </div>

        <div className="period-value">
          {formatPeriodLabel(period)}
        </div>

      </td>

      {/* Output Tax */}
      <td className="amount-cell text-end">
        {formatCurrency(row.totalOutputTax)}
      </td>

      {/* Eligible ITC */}
      <td className="amount-cell text-end">
        {formatCurrency(row.eligibleItc)}
      </td>

      {/* Utilized ITC */}
      <td className="amount-cell text-end">
        {formatCurrency(row.utilizedItc)}
      </td>

      {/* Excess ITC */}
      <td className="amount-cell text-end">

        <span
          className={
            Number(row.excessItc || 0) > 0
              ? "excess-itc-value"
              : "normal-itc-value"
          }
        >
          {formatCurrency(row.excessItc)}
        </span>

      </td>

      {/* ITC Ratio */}
      <td className="ratio-cell text-center">

        <div className="ratio-value">
          {formatPercent(itcRatio)}
        </div>

        <div className="ratio-progress">
          <div
            className="ratio-progress-bar"
            style={{
              width: `${Math.min(
                Math.max(itcRatio, 0),
                100
              )}%`,
            }}
          />
        </div>

      </td>

      {/* Risk */}
      <td className="risk-cell text-center">

        <span
          className={`risk-badge ${riskConfig.badge}`}
        >
          {riskConfig.label}
        </span>

        <div className="risk-score">
          {formatPercent(score)} risk
        </div>

      </td>

      {/* Filing */}
      <td className="filing-cell text-center">

        {delay > 0 ? (

          <span className="filing-delay-badge">
            <Clock3 size={13} />
            {delay} days
          </span>

        ) : (

          <span className="filing-on-time-badge">
            <CheckCircle2 size={13} />
            On time
          </span>

        )}

      </td>

      {/* Scrutiny Ground */}
      <td className="scrutiny-cell">

        <div
          className="scrutiny-reason"
          title={reason}
        >
          {reason}
        </div>

      </td>

      {/* Action */}
      <td className="action-cell text-center">

        <div className="d-flex justify-content-center align-items-center gap-1">

          <button
            type="button"
            className="btn btn-sm btn-outline-primary action-btn"
            onClick={() => onView(row)}
            title="View taxpayer details"
            aria-label={`View ${row.gstin}`}
          >
            <Eye size={14} />
            <span>View</span>
          </button>

          {noticeStatus === "ISSUED" ? (

            <button
              type="button"
              className="btn btn-sm btn-success action-btn"
              disabled
              title="ASMT-10 notice already issued"
            >
              <FileCheck2 size={14} />
              <span>Issued</span>
            </button>

          ) : (

            <button
              type="button"
              className="btn btn-sm btn-outline-danger action-btn"
              onClick={() => onNotice(row)}
              title="Issue ASMT-10 notice"
              aria-label={`Issue notice for ${row.gstin}`}
            >
              <Send size={14} />
              <span>Notice</span>
            </button>

          )}

        </div>

      </td>

    </tr>
  );
};

/* =========================================================
   PAGINATION
========================================================= */

const buildPageWindow = (
  current,
  total
) => {
  if (total <= 1) {
    return [1];
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
    const currentPage =
      pageNumber + 1;

    const rangeStart =
      totalRecords === 0
        ? 0
        : pageNumber * pageSize + 1;

    const rangeEnd = Math.min(
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
              htmlFor="page-size-select"
            >
              Rows per page
            </label>

            <select
              id="page-size-select"
              className="form-select form-select-sm"
              style={{ width: 80 }}
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
        </div>

        <nav aria-label="Scrutiny queue pagination">
          <ul className="pagination pagination-sm mb-0 flex-wrap justify-content-center">
            <li
              className={`page-item ${pageNumber === 0 ||
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

            <li
              className={`page-item ${pageNumber === 0 ||
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
                      pageNumber - 1
                    )
                  )
                }
              >
                <ChevronLeft
                  size={14}
                />
              </button>
            </li>

            {pageWindow.map(
              (page) =>
                typeof page ===
                  "number" ? (
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
                          page - 1
                        )
                      }
                    >
                      {page}
                    </button>
                  </li>
                ) : (
                  <li
                    key={page}
                    className="page-item disabled"
                  >
                    <span className="page-link">
                      …
                    </span>
                  </li>
                )
            )}

            <li
              className={`page-item ${pageNumber >=
                totalPages - 1 ||
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
                  totalPages - 1 ||
                  disabled
                }
                onClick={() =>
                  onPageChange(
                    Math.min(
                      totalPages - 1,
                      pageNumber + 1
                    )
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
                totalPages - 1 ||
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
                  totalPages - 1 ||
                  disabled
                }
                onClick={() =>
                  onPageChange(
                    totalPages - 1
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
      </div>
    );
  }
);

/* =========================================================
   MAIN DASHBOARD
========================================================= */

export default function GstAuditDashboard() {
  const [periods, setPeriods] =
    useState([]);

  const [selectedPeriod, setSelectedPeriod] =
    useState("");

  const [data, setData] =
    useState([]);

  const [metrics, setMetrics] =
    useState(null);

  const [loading, setLoading] =
    useState(false);

  const [loadingLabel, setLoadingLabel] =
    useState("");

  const [periodsLoading, setPeriodsLoading] =
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

  const [noticeStatus, setNoticeStatus] =
    useState("ALL");

  const [pageNumber, setPageNumber] =
    useState(0);

  const [pageSize, setPageSize] =
    useState(DEFAULT_PAGE_SIZE);

  const [modalRecord, setModalRecord] =
    useState(null);

  const [detailRecord, setDetailRecord] =
    useState(null);

  const [submittingNotice, setSubmittingNotice] =
    useState(false);

  const [toast, setToast] =
    useState(null);

  const [exporting, setExporting] =
    useState(false);

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

  const fetchControllerRef =
    useRef(null);

  /* =====================================================
     LOAD PERIODS
  ===================================================== */

  useEffect(() => {
    const controller =
      new AbortController();

    const loadPeriods =
      async () => {
        setPeriodsLoading(true);

        try {
          const response =
            await fetchAllReturnPeriods(
              {
                signal:
                  controller.signal,
              }
            );

          if (
            Array.isArray(response) &&
            response.length > 0
          ) {
            setPeriods(response);

            const first =
              typeof response[0] ===
                "object"
                ? response[0].value
                : response[0];

            setSelectedPeriod(
              String(first)
            );
          }
        } catch (err) {
          if (
            err?.name !==
            "AbortError" &&
            err?.name !==
            "CanceledError"
          ) {
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
          }
        } finally {
          if (
            !controller.signal
              .aborted
          ) {
            setPeriodsLoading(
              false
            );
          }
        }
      };

    loadPeriods();

    return () =>
      controller.abort();
  }, []);

  /* =====================================================
     FETCH DASHBOARD
  ===================================================== */

  const fetchAuditData =
    useCallback(
      async (
        period,
        forceRefresh = false
      ) => {
        if (!period) {
          return;
        }

        if (
          fetchControllerRef.current
        ) {
          fetchControllerRef.current.abort();
        }

        const controller =
          new AbortController();

        fetchControllerRef.current =
          controller;

        setLoading(true);
        setError(null);
        setLoadingLabel(
          "Loading scrutiny data..."
        );

        try {
          if (forceRefresh) {
            setLoadingLabel(
              "Refreshing dashboard cache..."
            );

            await refreshDashboardCache(
              {
                signal:
                  controller.signal,
              }
            );
          }

          if (
            controller.signal.aborted
          ) {
            return;
          }

          setLoadingLabel(
            "Loading dashboard metrics..."
          );

          const metricsRes =
            await fetchDashboardMetrics(
              {
                retPeriod: period,
                forceRefresh,
                signal:
                  controller.signal,
              }
            );

          if (
            controller.signal.aborted
          ) {
            return;
          }

          setMetrics(
            metricsRes || null
          );

          const expectedTotal =
            Number(
              metricsRes?.totalScrutinyCount
            );

          const hasValidTotal =
            Number.isFinite(
              expectedTotal
            ) &&
            expectedTotal > 0;

          const fetchSize =
            hasValidTotal
              ? Math.ceil(
                expectedTotal +
                FETCH_SIZE_BUFFER
              )
              : FALLBACK_SERVER_FETCH_SIZE;

          setLoadingLabel(
            hasValidTotal
              ? `Loading ${formatNumber(
                expectedTotal
              )} records...`
              : "Loading scrutiny records..."
          );

          const pipelineRes =
            await fetchScrutinyPipeline(
              {
                retPeriod: period,
                page: 0,
                size: fetchSize,
                riskCategory: "ALL",
                signal:
                  controller.signal,
              }
            );

          if (
            controller.signal.aborted
          ) {
            return;
          }

          const records =
            pipelineRes?.content ||
            (Array.isArray(
              pipelineRes
            )
              ? pipelineRes
              : []);

          const enriched =
            records.map(
              enrichRecord
            );

          setData(enriched);

          if (
            hasValidTotal &&
            records.length <
            expectedTotal
          ) {
            setToast({
              type: "error",
              message:
                `The server returned ${formatNumber(
                  records.length
                )} of approximately ${formatNumber(
                  expectedTotal
                )} expected records. Please refresh and check backend pagination.`,
            });
          }
        } catch (err) {
          if (
            err?.name ===
            "CanceledError" ||
            err?.name ===
            "AbortError" ||
            controller.signal.aborted
          ) {
            return;
          }

          console.error(
            "GST scrutiny data loading failed",
            err
          );

          setError(
            err?.response?.data
              ?.message ||
            err?.message ||
            "Unable to load GST scrutiny data."
          );

          setData([]);
        } finally {
          if (
            !controller.signal
              .aborted
          ) {
            setLoading(false);
            setLoadingLabel("");
          }
        }
      },
      []
    );

  /* =====================================================
     PERIOD CHANGE
  ===================================================== */

  useEffect(() => {
    if (!selectedPeriod) {
      return;
    }

    setPageNumber(0);
    setData([]);
    setMetrics(null);

    fetchAuditData(
      selectedPeriod
    );

    return () => {
      if (
        fetchControllerRef.current
      ) {
        fetchControllerRef.current.abort();
      }
    };
  }, [
    selectedPeriod,
    fetchAuditData,
  ]);

  /* =====================================================
     CLIENT FILTERING
  ===================================================== */

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

      const parsedMaxDelay =
        deferredMaxDelay ===
          ""
          ? null
          : Number(
            deferredMaxDelay
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
        maxDelayValue ===
        null &&
        noticeStatus === "ALL"
      ) {
        return data;
      }

      return data.filter(
        (row) => {
          if (
            query &&
            !row._gstinLower.includes(
              query
            )
          ) {
            return false;
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

          if (
            noticeStatus !==
            "ALL" &&
            row._noticeStatus !==
            noticeStatus
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
      noticeStatus,
    ]);

  /* =====================================================
     PAGINATION
  ===================================================== */

  const totalElements =
    displayedRecords.length;

  const totalPages = Math.max(
    1,
    Math.ceil(
      totalElements / pageSize
    )
  );

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

  /* =====================================================
     FILTER RESET
  ===================================================== */

  const resetFilters =
    useCallback(() => {
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

  const openNotice =
    useCallback((record) => {
      setModalRecord(record);
    }, []);

  const viewRecord =
    useCallback((record) => {
      setDetailRecord(record);
    }, []);

  const dispatchNotice =
    useCallback(
      async (payload) => {
        setSubmittingNotice(true);

        try {
          await issueAsmt10Notice({
            gstin:
              payload.gstin,

            retPeriod:
              payload.retPeriod,

            groundReason:
              payload.reason,
          });

          setModalRecord(null);

          setToast({
            type: "success",
            message:
              `ASMT-10 notice dispatched successfully for ${payload.gstin}.`,
          });

          await fetchAuditData(
            selectedPeriod
          );
        } catch (err) {
          setToast({
            type: "error",
            message:
              err?.response?.data
                ?.message ||
              err?.message ||
              "Failed to issue ASMT-10 notice.",
          });
        } finally {
          setSubmittingNotice(false);
        }
      },
      [
        fetchAuditData,
        selectedPeriod,
      ]
    );

  /* =====================================================
     KPI
  ===================================================== */

  const totalCount =
    metrics?.totalScrutinyCount ??
    data.length;

  const criticalCount =
    metrics?.criticalCount ??
    data.filter(
      (row) =>
        row._risk === "CRITICAL"
    ).length;

  const highCount =
    metrics?.highCount ??
    data.filter(
      (row) =>
        row._risk === "HIGH"
    ).length;

  const mediumCount =
    metrics?.mediumCount ??
    data.filter(
      (row) =>
        row._risk === "MEDIUM"
    ).length;

  const lowCount =
    metrics?.lowCount ??
    data.filter(
      (row) =>
        row._risk === "LOW"
    ).length;

  /* =====================================================
     EXPORT
  ===================================================== */

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

      setExporting(true);

      setToast({
        type: "success",
        message:
          `Preparing export of ${formatNumber(
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
            message:
              `Exported ${formatNumber(
                count
              )} records.`,
          });
        },
        (message) => {
          setExporting(false);

          setToast({
            type: "error",
            message,
          });
        }
      );
    }, [
      displayedRecords,
      selectedPeriod,
    ]);

  /* =====================================================
     DETAIL MODAL DATA
  ===================================================== */

  const detailRisk =
    detailRecord
      ? detailRecord._risk ||
      getRiskCategory(
        detailRecord
      )
      : "MEDIUM";

  const detailReason =
    detailRecord
      ? detailRecord._reason ||
      getReason(detailRecord)
      : "";

  const detailNoticeStatus =
    detailRecord
      ? detailRecord._noticeStatus ||
      getNoticeStatus(
        detailRecord
      )
      : "PENDING";

  /* =====================================================
     UI
  ===================================================== */

  return (
    <div className="gst-audit-dashboard min-vh-100">
      {/* =================================================
          OFFICE HEADER
      ================================================= */}

      <header className="gst-office-header bg-white border-bottom">
        <div className="container-fluid px-3 px-lg-4 py-3">
          <div className="d-flex flex-column flex-xl-row justify-content-between align-items-start align-items-xl-center gap-3">
            <div>
              <div className="d-flex align-items-center gap-2">
                <div className="gst-header-icon">
                  <ShieldAlert
                    size={20}
                  />
                </div>

                <div>
                  <h5 className="fw-bold text-dark mb-0 text-truncate">
                    GST Return Scrutiny &
                    ITC Risk Analysis
                  </h5>
                </div>
              </div>
            </div>

            <div className="d-flex flex-wrap align-items-center justify-content-end gap-2 w-100 w-xl-auto">
              <div
                className="flex-grow-1 flex-xl-grow-0"
                style={{
                  minWidth: 210,
                }}
              >
                <SearchablePeriodSelect
                  options={periods}
                  value={
                    selectedPeriod
                  }
                  loading={
                    periodsLoading
                  }
                  onChange={(
                    value
                  ) =>
                    setSelectedPeriod(
                      value
                    )
                  }
                />
              </div>

              <button
                type="button"
                className="btn btn-outline-success rounded-2 d-flex align-items-center justify-content-center gap-2"
                disabled={
                  loading ||
                  exporting ||
                  displayedRecords.length ===
                  0
                }
                onClick={
                  handleExport
                }
              >
                {exporting ? (
                  <Loader2
                    size={15}
                    className="spin"
                  />
                ) : (
                  <Download
                    size={15}
                  />
                )}
                Export
              </button>

              <button
                type="button"
                className="btn btn-primary rounded-2 d-flex align-items-center justify-content-center gap-2"
                disabled={
                  loading ||
                  !selectedPeriod
                }
                onClick={() =>
                  fetchAuditData(
                    selectedPeriod,
                    true
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

        <TopLoadingBar
          active={loading}
        />
      </header>

      <main className="container-fluid px-3 px-lg-4 py-4">
        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <div className="alert alert-danger shadow-sm d-flex align-items-start gap-2 rounded-3">
            <AlertTriangle
              size={18}
              className="mt-1"
            />

            <div className="flex-grow-1">
              <div className="fw-bold">
                Unable to load
                dashboard
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
            LOADING
        ================================================= */}

        {loading &&
          loadingLabel && (
            <div className="alert alert-info shadow-sm d-flex align-items-center gap-2 rounded-3 py-2">
              <Loader2
                size={16}
                className="spin"
              />

              <div className="small fw-semibold">
                {loadingLabel}
              </div>
            </div>
          )}

      {/* =========================================================
    KPI GRID — OFFICE / GST SCRUTINY
========================================================= */}

<div className="px-2 px-sm-3 px-lg-4">
  <div className="row g-3 mb-4">

    {/* Total Cases */}
    <div className="col-12 col-sm-6 col-xl-3">
      <KpiCard
        title="Total Cases"
        value={totalCount}
        subtitle="Scrutiny queue"
        icon={FileText}
        variant="primary"
        loading={loading}
      />
    </div>

    {/* Critical */}
    <div className="col-12 col-sm-6 col-xl-3">
      <KpiCard
        title="Critical"
        value={criticalCount}
        subtitle="Immediate attention"
        icon={ShieldAlert}
        variant="danger"
        loading={loading}
      />
    </div>

    {/* High Risk */}
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

    {/* Medium Risk */}
    <div className="col-12 col-sm-6 col-xl-3">
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
</div>

       {/* =========================================================
    RISK DISTRIBUTION — COMPACT MODERN OFFICE UI
========================================================= */}

<div className="gst-risk-card mb-4">

  <div className="gst-risk-header">

    <div className="gst-risk-title-wrap">
      <div className="gst-risk-title">
        Risk Distribution
      </div>

      <span className="gst-risk-total">
        {formatNumber(totalCount)} total cases
      </span>
    </div>

    <div className="gst-risk-total-percent">
      100%
    </div>

  </div>

  {/* Distribution Bar */}
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
        width: `${
          totalCount
            ? (criticalCount / totalCount) * 100
            : 0
        }%`,
      }}
      title={`Critical: ${formatNumber(criticalCount)}`}
    />

    <div
      className="gst-risk-segment high"
      style={{
        width: `${
          totalCount
            ? (highCount / totalCount) * 100
            : 0
        }%`,
      }}
      title={`High: ${formatNumber(highCount)}`}
    />

    <div
      className="gst-risk-segment medium"
      style={{
        width: `${
          totalCount
            ? (mediumCount / totalCount) * 100
            : 0
        }%`,
      }}
      title={`Medium: ${formatNumber(mediumCount)}`}
    />

    <div
      className="gst-risk-segment low"
      style={{
        width: `${
          totalCount
            ? (lowCount / totalCount) * 100
            : 0
        }%`,
      }}
      title={`Low: ${formatNumber(lowCount)}`}
    />

  </div>

  {/* Risk Summary */}
  <div className="gst-risk-summary">

    {/* Critical */}
    <div className="gst-risk-item critical-item">
      <span className="gst-risk-dot critical-dot" />

      <div className="gst-risk-item-content">
        <span className="gst-risk-label">
          Critical
        </span>

        <strong>
          {formatNumber(criticalCount)}
        </strong>
      </div>
    </div>

    {/* High */}
    <div className="gst-risk-item high-item">
      <span className="gst-risk-dot high-dot" />

      <div className="gst-risk-item-content">
        <span className="gst-risk-label">
          High
        </span>

        <strong>
          {formatNumber(highCount)}
        </strong>
      </div>
    </div>

    {/* Medium */}
    <div className="gst-risk-item medium-item">
      <span className="gst-risk-dot medium-dot" />

      <div className="gst-risk-item-content">
        <span className="gst-risk-label">
          Medium
        </span>

        <strong>
          {formatNumber(mediumCount)}
        </strong>
      </div>
    </div>

    {/* Low */}
    <div className="gst-risk-item low-item">
      <span className="gst-risk-dot low-dot" />

      <div className="gst-risk-item-content">
        <span className="gst-risk-label">
          Low
        </span>

        <strong>
          {formatNumber(lowCount)}
        </strong>
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
            <div className="d-flex align-items-center justify-content-between gap-3 flex-nowrap">

              {/* Left: Title + Count */}
              <div className="flex-shrink-0 text-nowrap">
                <h5 className="fw-bold text-dark mb-0">
                  Review taxpayer discrepancies
                </h5>

                <div className="small text-muted mt-1">
                  {formatNumber(totalElements)} matching records
                </div>
              </div>

              {/* Right: Search + Filters */}
              <div className="d-flex align-items-center justify-content-end gap-2 flex-nowrap ms-auto">

                {/* Search */}
                <div
                  className="input-group input-group-sm"
                  style={{
                    width: "280px",
                  }}
                >
                  <span className="input-group-text bg-white">
                    {isFilterPending ? (
                      <Loader2
                        size={14}
                        className="text-muted spin"
                      />
                    ) : (
                      <Search
                        size={14}
                        className="text-muted"
                      />
                    )}
                  </span>

                  <input
                    type="search"
                    className="form-control"
                    placeholder="Search GSTIN..."
                    value={searchTerm}
                    onChange={(event) =>
                      setSearchTerm(event.target.value)
                    }
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

                {/* Risk */}
                <select
                  className="form-select form-select-sm"
                  style={{
                    width: "135px",
                    flexShrink: 0,
                  }}
                  value={riskFilter}
                  onChange={(event) =>
                    setRiskFilter(event.target.value)
                  }
                  aria-label="Risk filter"
                >
                  <option value="ALL">All risk</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>

                {/* Filters */}
                <button
                  type="button"
                  className={`btn btn-sm d-flex align-items-center gap-1 flex-shrink-0 ${showAdvanced
                    ? "btn-primary"
                    : "btn-outline-secondary"
                    }`}
                  onClick={() =>
                    setShowAdvanced((previous) => !previous)
                  }
                >
                  <Filter size={14} />
                  Filters
                </button>

              </div>
            </div>
          </div>

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
            noticeStatus={
              noticeStatus
            }
            setNoticeStatus={
              setNoticeStatus
            }
            onReset={
              resetFilters
            }
          />

          {/* Active filters */}

          {(searchTerm ||
            riskFilter !==
            "ALL" ||
            minRiskScore ||
            maxDelay ||
            noticeStatus !==
            "ALL") && (
              <div className="px-3 py-2 bg-light border-bottom d-flex flex-wrap align-items-center gap-2">
                <span className="small fw-bold text-muted">
                  Active filters:
                </span>

                {searchTerm && (
                  <span className="badge bg-white text-dark border">
                    GSTIN:{" "}
                    {searchTerm}
                  </span>
                )}

                {riskFilter !==
                  "ALL" && (
                    <span className="badge bg-white text-dark border">
                      Risk:{" "}
                      {riskFilter}
                    </span>
                  )}

                {minRiskScore && (
                  <span className="badge bg-white text-dark border">
                    Risk ≥{" "}
                    {minRiskScore}
                  </span>
                )}

                {maxDelay && (
                  <span className="badge bg-white text-dark border">
                    Delay ≤{" "}
                    {maxDelay}{" "}
                    days
                  </span>
                )}

                {noticeStatus !==
                  "ALL" && (
                    <span className="badge bg-white text-dark border">
                      Notice:{" "}
                      {noticeStatus}
                    </span>
                  )}

                <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                  {formatNumber(
                    totalElements
                  )}{" "}
                  match
                  {totalElements ===
                    1
                    ? ""
                    : "es"}
                </span>

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

          {/* Table */}

          <div className="table-responsive gst-table-wrapper">
            <table className="table table-hover align-middle mb-0 gst-office-table">

              <thead>
                <tr className="official-table-header">

                  <th className="text-center taxpayer-column">
                    Taxpayer
                  </th>

                  <th className="text-center amount-column">
                    Output Tax
                  </th>

                  <th className="text-center amount-column">
                    Eligible ITC
                  </th>

                  <th className="text-center amount-column">
                    Utilized ITC
                  </th>

                  <th className="text-center amount-column">
                    Excess ITC
                  </th>

                  <th className="text-center ratio-column">
                    ITC Ratio
                  </th>

                  <th className="text-center risk-column">
                    Risk
                  </th>

                  <th className="text-center filing-column">
                    Filing
                  </th>

                  <th className="text-center scrutiny-column">
                    Scrutiny Ground
                  </th>

                  <th className="text-center action-column">
                    Action
                  </th>

                </tr>
              </thead>

              <tbody>

                {/* Loading */}
                {loading && data.length === 0 ? (

                  Array.from({ length: pageSize }).map((_, index) => (
                    <SkeletonRow
                      key={`skeleton-${index}`}
                    />
                  ))

                ) : paginatedRecords.length === 0 ? (

                  /* Empty State */
                  <tr>
                    <td
                      colSpan={10}
                      className="gst-empty-cell"
                    >
                      <div className="gst-empty-state">

                        <div className="empty-state-icon">
                          <FilterX size={25} />
                        </div>

                        <div className="empty-state-title">
                          No scrutiny records found
                        </div>

                        <div className="empty-state-description">
                          No taxpayer records match the selected
                          period or applied filters.
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

                  /* Data */
                  paginatedRecords.map((row, index) => (

                    <ScrutinyRow
                      key={
                        row.serialNo ||
                        `${row.gstin}-${row._period}-${index}`
                      }
                      row={row}
                      onNotice={openNotice}
                      onView={viewRecord}
                    />

                  ))

                )}

              </tbody>

            </table>
          </div>

          {/* Footer */}

          <div className="card-footer bg-white border-top p-3">
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
              onPageChange={
                setPageNumber
              }
              onPageSizeChange={(
                size
              ) => {
                setPageSize(
                  size
                );
                setPageNumber(
                  0
                );
              }}
              disabled={
                loading
              }
            />
          </div>
        </section>
      </main>

      {/* =================================================
          DETAIL MODAL
      ================================================= */}

      {detailRecord && (
        <div
          className="modal fade show d-block"
          style={{
            background:
              "rgba(15,23,42,.65)",
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
            <div className="modal-content border-0 rounded-3 shadow-lg">
              <div className="modal-header">
                <div>
                  <h5 className="fw-bold mb-1">
                    Taxpayer Scrutiny
                    Details
                  </h5>

                  <div className="small text-muted font-monospace">
                    {
                      detailRecord.gstin
                    }
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-close"
                  onClick={() =>
                    setDetailRecord(
                      null
                    )
                  }
                  aria-label="Close"
                />
              </div>

              <div className="modal-body bg-light">
                <div className="row g-3">
                  <div className="col-md-6">
                    <div className="detail-box">
                      <div className="detail-label">
                        GSTIN
                      </div>

                      <div className="font-monospace fw-bold mt-1">
                        {
                          detailRecord.gstin
                        }
                      </div>
                    </div>
                  </div>

                  <div className="col-md-3">
                    <div className="detail-box">
                      <div className="detail-label">
                        Return Period
                      </div>

                      <div className="fw-bold mt-1">
                        {formatPeriodLabel(
                          getReturnPeriod(
                            detailRecord
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="col-md-3">
                    <div className="detail-box">
                      <div className="detail-label">
                        Risk
                      </div>

                      <div className="mt-1">
                        <RiskBadge
                          category={
                            detailRisk
                          }
                          score={getRiskScore(
                            detailRecord
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="detail-box">
                      <div className="detail-label">
                        Output Tax
                      </div>

                      <div className="fw-bold mt-1">
                        {formatCurrency(
                          detailRecord.totalOutputTax
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="detail-box">
                      <div className="detail-label">
                        Eligible ITC
                      </div>

                      <div className="fw-bold mt-1">
                        {formatCurrency(
                          detailRecord.eligibleItc
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="detail-box">
                      <div className="detail-label">
                        Utilized ITC
                      </div>

                      <div className="fw-bold mt-1">
                        {formatCurrency(
                          detailRecord.utilizedItc
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="detail-box">
                      <div className="detail-label">
                        Excess ITC
                      </div>

                      <div
                        className={`fw-bold mt-1 ${getExcessItc(
                          detailRecord
                        ) > 0
                          ? "text-danger"
                          : "text-success"
                          }`}
                      >
                        {formatCurrency(
                          getExcessItc(
                            detailRecord
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="detail-box">
                      <div className="detail-label">
                        Filing Delay
                      </div>

                      <div className="fw-bold mt-1">
                        {formatNumber(
                          detailRecord.filingDelayDays
                        )}{" "}
                        days
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="detail-box">
                      <div className="detail-label">
                        ITC Utilization
                      </div>

                      <div className="fw-bold mt-1">
                        {formatPercent(
                          getItcUtilization(
                            detailRecord
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="detail-box">
                      <div className="detail-label">
                        RCM Tax
                      </div>

                      <div className="fw-bold mt-1">
                        {formatCurrency(
                          detailRecord.rcmTotalTax
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="detail-box">
                      <div className="detail-label">
                        Rule Risk
                      </div>

                      <div className="fw-bold mt-1">
                        {formatPercent(
                          detailRecord.ruleRiskScore
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="detail-box">
                      <div className="detail-label">
                        XGBoost Risk
                      </div>

                      <div className="fw-bold mt-1">
                        {formatPercent(
                          detailRecord.xgbRiskScore
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="detail-box">
                      <div className="detail-label">
                        DL4J Anomaly
                      </div>

                      <div className="fw-bold mt-1">
                        {formatPercent(
                          detailRecord.dl4jAnomalyScore
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="detail-box">
                      <div className="detail-label">
                        Notice Status
                      </div>

                      <div className="mt-1">
                        {detailNoticeStatus ===
                          "ISSUED" ? (
                          <span className="badge bg-success-subtle text-success border border-success-subtle">
                            <CheckCircle2
                              size={12}
                              className="me-1"
                            />
                            Issued
                          </span>
                        ) : (
                          <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="col-12">
                    <div className="detail-box">
                      <div className="detail-label mb-2">
                        Discrepancy Status
                      </div>

                      <span className="badge bg-light text-dark border">
                        {
                          detailRecord.discrepancyStatus ||
                          "NO_DISCREPANCY"
                        }
                      </span>
                    </div>
                  </div>

                  <div className="col-12">
                    <div className="detail-box">
                      <div className="detail-label mb-2">
                        Scrutiny Grounds
                      </div>

                      <div className="text-dark small detail-reason">
                        {detailReason}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    setDetailRecord(
                      null
                    )
                  }
                >
                  Close
                </button>

                {detailNoticeStatus !==
                  "ISSUED" && (
                    <button
                      type="button"
                      className="btn btn-primary d-flex align-items-center gap-2"
                      onClick={() => {
                        setDetailRecord(
                          null
                        );

                        openNotice(
                          detailRecord
                        );
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
        show={Boolean(
          modalRecord
        )}
        record={modalRecord}
        onClose={() =>
          setModalRecord(null)
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

