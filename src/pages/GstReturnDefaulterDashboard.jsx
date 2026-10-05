import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock3,
  Download,
  Eye,
  FileText,
  FileWarning,
  Filter,
  FilterX,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  UserRoundX,
  Users,
  UserX,
  X,
} from "lucide-react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  exportDefaultersCsv,
  fetchDefaulterOffices,
  fetchDefaulterPeriods,
  fetchDefaulterSummary,
  fetchDefaulters,
} from "../services/defaulterDashboardService";

import GstDefaulterViewModal from "./GstDefaulterViewModal";

import "./GstReturnDefaulterDashboard.css";

const PAGE_SIZES = [10, 25, 50, 100];

const TABLE_COLUMNS = 13;

const EMPTY_PAGE = {
  content: [],
  totalElements: 0,
  totalPages: 0,
};

const CHART_COLORS = {
  green: "#3fa867",
  amber: "#f7b91c",
  orange: "#ff8618",
  red: "#ef3b3b",
};

/* Formatters are created once - building an Intl formatter per cell is slow. */
const INTEGER_FORMAT = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const toNumber = (value) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
};

const safeCount = (value) => Math.max(0, toNumber(value));

const integer = (value) => INTEGER_FORMAT.format(toNumber(value));

const percentage = (value, total) => {
  const denominator = toNumber(total);

  if (denominator <= 0) return "0.00%";

  return `${((toNumber(value) / denominator) * 100).toFixed(2)}%`;
};

const normalizeLevel = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");

const badgeClass = (value) =>
  normalizeLevel(value).toLowerCase().replaceAll("_", "-") || "neutral";

const humanize = (value) => {
  const normalized = normalizeLevel(value);

  if (!normalized) return "—";

  return normalized
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const normalizeList = (response) => {
  const source = response?.data ?? response;

  if (Array.isArray(source)) return source;

  if (Array.isArray(source?.content)) return source.content;

  if (Array.isArray(source?.items)) return source.items;

  return [];
};

const normalizePage = (response) => {
  const source = response?.data ?? response ?? {};

  const content = Array.isArray(source.content)
    ? source.content
    : Array.isArray(source.items)
      ? source.items
      : [];

  return {
    ...source,
    content,
    totalElements: toNumber(
      source.totalElements ?? source.totalRecords ?? source.total,
    ),
    totalPages: toNumber(source.totalPages),
  };
};

const isAbortError = (error) =>
  error?.name === "CanceledError" ||
  error?.name === "AbortError" ||
  error?.code === "ERR_CANCELED";

const apiError = (error, fallback) =>
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  error?.message ||
  fallback;

/*
 * A blob request returns its error body as a Blob, so the usual
 * error.response.data.message is undefined - read the blob as JSON first.
 */
const readErrorMessage = async (error, fallback) => {
  const data = error?.response?.data;

  if (typeof Blob !== "undefined" && data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());

      return parsed?.message || parsed?.error || fallback;
    } catch {
      return fallback;
    }
  }

  return apiError(error, fallback);
};

const formatDate = (value) => {
  if (!value) return "—";

  const text = String(value);

  if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(text)) return text;

  // ISO date: format the parts directly - new Date("YYYY-MM-DD") is UTC and can show the previous day
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);

  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? text : DATE_FORMAT.format(date);
};

/*
 * Prefer the server-side totals. Only when the summary has no usable numbers do
 * we count the rows of the CURRENT PAGE - and the chart says so.
 */
const pickCounts = (serverCounts, pageCounts) =>
  Object.values(serverCounts).some((value) => value > 0)
    ? { counts: serverCounts, fromPage: false }
    : { counts: pageCounts, fromPage: true };

function FilterField({ id, label, required = false, children }) {
  return (
    <div className="def-filter-field">
      <label htmlFor={id}>
        {label}

        {required && <span className="def-required"> *</span>}
      </label>

      {children}
    </div>
  );
}

function KpiCard({ title, value, subtitle, icon: Icon, tone }) {
  return (
    <article className={`def-kpi def-kpi-${tone}`}>
      <div className="def-kpi-content">
        <span className="def-kpi-title">{title}</span>

        <strong className="def-kpi-value">{integer(value)}</strong>

        <span className="def-kpi-subtitle">{subtitle}</span>
      </div>

      <div className="def-kpi-icon">
        <Icon size={24} />
      </div>
    </article>
  );
}

function ChartLegend({ data, total }) {
  return (
    <div className="def-chart-legend">
      {data.map((item) => (
        <div className="def-chart-legend-row" key={item.name}>
          <div className="def-chart-legend-label">
            <span
              className="def-chart-dot"
              style={{ backgroundColor: item.color }}
            />

            <span>{item.name}</span>
          </div>

          <strong>
            {integer(item.value)}

            <small>{percentage(item.value, total)}</small>
          </strong>
        </div>
      ))}
    </div>
  );
}

export default function GstReturnDefaulterDashboard() {
  const [periods, setPeriods] = useState([]);
  const [offices, setOffices] = useState([]);

  const [period, setPeriod] = useState("");
  const [office, setOffice] = useState("");
  const [filingStatus, setFilingStatus] = useState("");
  const [defaultLevel, setDefaultLevel] = useState("");
  const [gstr3aEligible, setGstr3aEligible] = useState("");
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);

  const [summary, setSummary] = useState(null);
  const [data, setData] = useState(EMPTY_PAGE);

  const [summaryLoading, setSummaryLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [selectedDefaulter, setSelectedDefaulter] = useState(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);

  const openDefaulterView = useCallback((row) => {
    setSelectedDefaulter(row);
    setViewModalOpen(true);
  }, []);

  const closeDefaulterView = useCallback(() => {
    setViewModalOpen(false);
    setSelectedDefaulter(null);
  }, []);

  /* ---------------------------------------------------------------- periods */

  useEffect(() => {
    const controller = new AbortController();

    fetchDefaulterPeriods({ signal: controller.signal })
      .then((response) => {
        const list = normalizeList(response);

        setPeriods(list);

        if (list.length > 0) {
          setPeriod((current) => current || String(list[0]?.value ?? ""));
        }
      })
      .catch((err) => {
        if (!isAbortError(err)) {
          setError(apiError(err, "Unable to load GST return periods."));
        }
      });

    return () => controller.abort();
  }, []);

  /* ---------------------------------------------------------------- offices */

  useEffect(() => {
    if (!period) {
      setOffices([]);

      return undefined;
    }

    const controller = new AbortController();

    fetchDefaulterOffices(period, { signal: controller.signal })
      .then((response) => setOffices(normalizeList(response)))
      .catch((err) => {
        if (!isAbortError(err)) setOffices([]);
      });

    return () => controller.abort();
  }, [period]);

  /* ---------------------------------------------------------------- requests */

  // filters only: the summary does not depend on the page or page size
  const filters = useMemo(
    () => ({
      retPeriod: period,
      office,
      filingStatus,
      defaultLevel,
      gstr3aEligible,
      search,
    }),
    [period, office, filingStatus, defaultLevel, gstr3aEligible, search],
  );

  const listParams = useMemo(
    () => ({ ...filters, page, size }),
    [filters, page, size],
  );

  // summary: reloaded when a filter changes, NOT on every page / page-size change
  useEffect(() => {
    if (!period) return undefined;

    const controller = new AbortController();

    const load = async () => {
      setSummaryLoading(true);

      try {
        const response = await fetchDefaulterSummary(filters, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        setSummary(response?.data ?? response ?? null);
      } catch (err) {
        if (!isAbortError(err)) {
          setError(apiError(err, "Unable to load the defaulter summary."));
        }
      } finally {
        if (!controller.signal.aborted) setSummaryLoading(false);
      }
    };

    load();

    return () => controller.abort();
  }, [filters, period, refreshKey]);

  // list
  useEffect(() => {
    if (!period) return undefined;

    const controller = new AbortController();

    const load = async () => {
      setListLoading(true);
      setError("");

      try {
        const response = await fetchDefaulters(listParams, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        setData(normalizePage(response));
        setLastUpdated(new Date());
      } catch (err) {
        if (!isAbortError(err)) {
          setError(apiError(err, "Unable to load the defaulter list."));
        }
      } finally {
        if (!controller.signal.aborted) setListLoading(false);
      }
    };

    load();

    return () => controller.abort();
  }, [listParams, period, refreshKey]);

  // if the result set shrinks (refresh / new data) while on a later page, go to the last page
  useEffect(() => {
    const pages = toNumber(data.totalPages);

    if (pages > 0 && page >= pages) setPage(pages - 1);
  }, [data.totalPages, page]);

  /* ---------------------------------------------------------------- handlers */

  const changeFilter = (setter) => (event) => {
    setter(event.target.value);
    setPage(0);
  };

  const changePeriod = (event) => {
    setPeriod(event.target.value);
    // an office from the previous period may not exist in the new one
    setOffice("");
    setPage(0);
  };

  const submitSearch = (event) => {
    event.preventDefault();

    setSearch(searchText.trim());
    setPage(0);
  };

  const resetFilters = () => {
    setOffice("");
    setFilingStatus("");
    setDefaultLevel("");
    setGstr3aEligible("");
    setSearchText("");
    setSearch("");
    setPage(0);
  };

  const exportCsv = useCallback(async () => {
    if (!period || exporting) return;

    setExporting(true);
    setError("");

    try {
      const blob = await exportDefaultersCsv(filters);

      if (typeof Blob === "undefined" || !(blob instanceof Blob)) {
        throw new Error("Unexpected response while exporting the CSV.");
      }

      // an error body can arrive with HTTP 200 in some proxies
      if (blob.type && blob.type.includes("json")) {
        throw new Error(
          await readErrorMessage(
            { response: { data: blob } },
            "CSV export failed.",
          ),
        );
      }

      const url = URL.createObjectURL(blob);

      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = `gst-3b-defaulters-${period}.csv`;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      // revoking immediately can cancel the download in some browsers
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(await readErrorMessage(err, "CSV export failed."));
    } finally {
      setExporting(false);
    }
  }, [period, exporting, filters]);

  /* ---------------------------------------------------------------- derived data */

  const records = Array.isArray(data.content) ? data.content : [];

  const countRowsBy = (field, values) => {
    const result = Object.fromEntries(values.map((value) => [value, 0]));

    records.forEach((row) => {
      const value = normalizeLevel(row?.[field]);

      if (Object.prototype.hasOwnProperty.call(result, value)) {
        result[value] += 1;
      }
    });

    return result;
  };

  const totalRecords = safeCount(summary?.total ?? data.totalElements);
  const notFiled = safeCount(summary?.notFiled);
  const filedLate = safeCount(summary?.filedLate);

  const filedOnTime =
    summary?.filedOnTime != null
      ? safeCount(summary.filedOnTime)
      : Math.max(0, totalRecords - notFiled - filedLate);

  const filing = useMemo(() => {
    const { counts, fromPage } = pickCounts(
      {
        NOT_FILED: notFiled,
        FILED_LATE: filedLate,
        FILED_ON_TIME: filedOnTime,
      },
      countRowsBy("filingStatus", ["NOT_FILED", "FILED_LATE", "FILED_ON_TIME"]),
    );

    const chart = [
      { name: "Not Filed", value: counts.NOT_FILED, color: CHART_COLORS.red },
      {
        name: "Filed Late",
        value: counts.FILED_LATE,
        color: CHART_COLORS.amber,
      },
      {
        name: "Filed On Time",
        value: counts.FILED_ON_TIME,
        color: CHART_COLORS.green,
      },
    ];

    return {
      chart,
      fromPage,
      total: chart.reduce((sum, item) => sum + safeCount(item.value), 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notFiled, filedLate, filedOnTime, data.content]);

  const defaults = useMemo(() => {
    const { counts, fromPage } = pickCounts(
      {
        NORMAL: safeCount(
          summary?.normal ?? summary?.normalDefaults ?? summary?.defaultNormal,
        ),
        WARNING: safeCount(
          summary?.warning ??
            summary?.warningDefaults ??
            summary?.defaultWarning,
        ),
        HIGH: safeCount(
          summary?.high ?? summary?.highDefaults ?? summary?.defaultHigh,
        ),
        CRITICAL: safeCount(
          summary?.critical ??
            summary?.criticalDefaults ??
            summary?.defaultCritical,
        ),
      },
      countRowsBy("defaultLevel", ["NORMAL", "WARNING", "HIGH", "CRITICAL"]),
    );

    const chart = [
      { name: "Normal", value: counts.NORMAL, color: CHART_COLORS.green },
      { name: "Warning", value: counts.WARNING, color: CHART_COLORS.amber },
      { name: "High", value: counts.HIGH, color: CHART_COLORS.orange },
      { name: "Critical", value: counts.CRITICAL, color: CHART_COLORS.red },
    ];

    return {
      chart,
      fromPage,
      total: chart.reduce((sum, item) => sum + safeCount(item.value), 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, data.content]);

  const totalPages = toNumber(data.totalPages);
  const totalElements = toNumber(data.totalElements);

  const firstRecord = totalElements ? page * size + 1 : 0;
  const lastRecord = Math.min((page + 1) * size, totalElements);

  const refreshing = summaryLoading || listLoading;

  /* ---------------------------------------------------------------- render */

  return (
    <>
      <main className="def-dashboard">
        <section className="def-filter-panel">
          {/* =====================================================
      FILTER HEADER
  ====================================================== */}
          <div className="def-filter-topline">
            <div className="def-filter-title">
              <div className="def-filter-title-icon">
                <Filter size={18} />
              </div>

              <div>
                <h2>Return Defaulter Analysis</h2>
                <p>
                  GSTR-3B filing compliance, default classification and GSTR-3A
                  eligibility monitoring
                </p>
              </div>
            </div>

            <div className="def-filter-meta">
              <div className="def-last-updated">
                <CalendarDays size={14} />

                <span>
                  Return Period:
                  <strong>
                    {period
                      ? ` ${
                          periods.find((item) => item.value === period)
                            ?.label || period
                        }`
                      : " —"}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* =====================================================
      FILTER GRID
  ====================================================== */}
          <div className="def-filter-grid">
            {/* RETURN PERIOD */}
            <div className="def-filter-field">
              <label htmlFor="def-period">
                Return Period <span>*</span>
              </label>

              <select id="def-period" value={period} onChange={changePeriod}>
                <option value="">Select Period</option>

                {periods.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            {/* OFFICE */}
            <div className="def-filter-field">
              <label htmlFor="def-office">Office / Jurisdiction</label>

              <select
                id="def-office"
                value={office}
                onChange={changeFilter(setOffice)}
              >
                <option value="">All Offices</option>

                {offices.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            {/* FILING STATUS */}
            <div className="def-filter-field">
              <label htmlFor="def-filing">Filing Status</label>

              <select
                id="def-filing"
                value={filingStatus}
                onChange={changeFilter(setFilingStatus)}
              >
                <option value="">All Filing Status</option>
                <option value="NOT_FILED">Not Filed</option>
                <option value="FILED_LATE">Filed Late</option>
                <option value="FILED_ON_TIME">Filed On Time</option>
                <option value="NOT_DUE">Not Due</option>
              </select>
            </div>

            {/* DEFAULT LEVEL */}
            <div className="def-filter-field">
              <label htmlFor="def-default">Default Level</label>

              <select
                id="def-default"
                value={defaultLevel}
                onChange={changeFilter(setDefaultLevel)}
              >
                <option value="">All Default Levels</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="WARNING">Warning</option>
                <option value="NORMAL">Normal</option>
              </select>
            </div>

            {/* GSTR-3A */}
            <div className="def-filter-field">
              <label htmlFor="def-gstr3a">GSTR-3A Eligible</label>

              <select
                id="def-gstr3a"
                value={gstr3aEligible}
                onChange={changeFilter(setGstr3aEligible)}
              >
                <option value="">All Eligibility</option>
                <option value="Y">Eligible</option>
                <option value="N">Not Eligible</option>
              </select>
            </div>

            {/* SEARCH */}
            <div className="def-filter-field">
              <label htmlFor="def-search">GSTIN / Taxpayer / Office</label>

              <div className="def-search-input">
                <Search size={16} />

                <input
                  id="def-search"
                  type="text"
                  value={searchText}
                  maxLength={100}
                  placeholder="GSTIN, taxpayer or office"
                  onChange={(event) => setSearchText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitSearch(event);
                    }
                  }}
                />
              </div>
            </div>

            {/* ACTIONS */}
            <div className="def-filter-actions">
              <button
                type="button"
                className="def-btn def-btn-search"
                onClick={submitSearch}
                disabled={!period}
              >
                <Search size={15} />
                Search
              </button>

              <button
                type="button"
                className="def-btn def-btn-reset"
                onClick={resetFilters}
              >
                <RotateCcw size={15} />
                Reset
              </button>

              <button
                type="button"
                className="def-btn def-btn-export"
                onClick={exportCsv}
                disabled={!period || exporting}
              >
                {exporting ? (
                  <Loader2 size={15} className="def-spin" />
                ) : (
                  <Download size={15} />
                )}

                {exporting ? "Exporting..." : "Export CSV"}
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div className="def-error" role="alert">
            <AlertTriangle size={18} />

            {error}
          </div>
        )}

        <section className="def-kpis def-kpis--five">
          <KpiCard
            title="Total GSTINs"
            value={totalRecords}
            subtitle="Selected return period"
            icon={Users}
            tone="blue"
          />

          <KpiCard
            title="Not Filed"
            value={notFiled}
            subtitle={`${percentage(notFiled, totalRecords)} of total`}
            icon={UserRoundX}
            tone="red"
          />

          <KpiCard
            title="Filed Late"
            value={filedLate}
            subtitle={`${percentage(filedLate, totalRecords)} of total`}
            icon={Clock3}
            tone="amber"
          />

          <KpiCard
            title="Filed On Time"
            value={filedOnTime}
            subtitle={`${percentage(filedOnTime, totalRecords)} of total`}
            icon={CheckCircle2}
            tone="green"
          />

          <KpiCard
            title="GSTR-3A Eligible"
            value={summary?.gstr3aEligible}
            subtitle="Pending statutory action"
            icon={Bell}
            tone="orange"
          />
        </section>

        <section className="def-chart-grid def-chart-grid--two">
          <article className="def-chart-card">
            <div className="def-chart-header">
              <h3>Filing Status Distribution</h3>

              {filing.fromPage && filing.total > 0 && (
                <small className="def-chart-note">Current page only</small>
              )}
            </div>

            {filing.total > 0 ? (
              <div className="def-chart-body def-pie-layout">
                <div className="def-pie-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={filing.chart}
                        dataKey="value"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={1}
                        stroke="#fff"
                        strokeWidth={2}
                        isAnimationActive={false}
                      >
                        {filing.chart.map((item) => (
                          <Cell key={item.name} fill={item.color} />
                        ))}
                      </Pie>

                      <Tooltip
                        formatter={(value, name) => [
                          `${integer(value)} (${percentage(value, filing.total)})`,
                          name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <ChartLegend data={filing.chart} total={filing.total} />
              </div>
            ) : (
              <div className="def-chart-empty">No filing status data.</div>
            )}
          </article>

          <article className="def-chart-card">
            <div className="def-chart-header">
              <h3>Default Level Distribution</h3>

              {defaults.fromPage && defaults.total > 0 && (
                <small className="def-chart-note">Current page only</small>
              )}
            </div>

            {defaults.total > 0 ? (
              <div className="def-chart-body">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={defaults.chart}>
                    <CartesianGrid
                      stroke="#e3e9ef"
                      strokeDasharray="3 3"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      tick={{ fontSize: 10 }}
                    />

                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      width={42}
                      tick={{ fontSize: 9 }}
                    />

                    <Tooltip
                      formatter={(value) => [integer(value), "GSTINs"]}
                    />

                    <Bar
                      dataKey="value"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={52}
                      isAnimationActive={false}
                    >
                      {defaults.chart.map((item) => (
                        <Cell key={item.name} fill={item.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="def-chart-empty">No default level data.</div>
            )}
          </article>
        </section>

        <section className="def-table-card">
          <div className="def-table-toolbar">
            <h2>
              Return Defaulters List{" "}
              <span>({integer(totalElements)} records)</span>
            </h2>

            <div className="def-table-toolbar-right">
              <span>Show</span>

              <select
                value={size}
                onChange={(event) => {
                  setSize(Number(event.target.value));
                  setPage(0);
                }}
              >
                {PAGE_SIZES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>

              <span>entries</span>

              <div className="def-inline-page">
                <span>Page</span>

                <strong>{totalPages ? page + 1 : 0}</strong>

                <span>of {totalPages}</span>

                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={page === 0 || listLoading}
                  onClick={() => setPage((value) => Math.max(0, value - 1))}
                >
                  <ChevronLeft size={14} />
                </button>

                <button
                  type="button"
                  aria-label="Next page"
                  disabled={
                    !totalPages || page >= totalPages - 1 || listLoading
                  }
                  onClick={() => setPage((value) => value + 1)}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>

          <div className="def-table-scroll">
            <table className="def-reference-table" aria-busy={listLoading}>
              <thead>
                <tr>
                  <th>#</th>
                  <th className="col-gstin">GSTIN</th>
                  <th className="col-taxpayer">Taxpayer Name</th>
                  <th className="col-office">Office</th>
                  <th>Due Date</th>
                  <th>Filing Status</th>
                  <th>Filing Date</th>
                  <th>
                    Delay <span>(Days)</span>
                  </th>
                  <th>Output Tax (₹)</th>
                  <th>Default Level</th>
                  <th>GSTR-3A</th>
                  <th>Sec 62</th>
                  <th className="col-action">Action</th>
                </tr>
              </thead>

              <tbody>
                {!period ? (
                  <tr>
                    <td className="def-table-message" colSpan={TABLE_COLUMNS}>
                      <FileWarning size={17} /> Select a return period to view
                      defaulters.
                    </td>
                  </tr>
                ) : listLoading ? (
                  <tr>
                    <td className="def-table-message" colSpan={TABLE_COLUMNS}>
                      <Loader2 size={17} className="def-spin" /> Loading
                      records...
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td className="def-table-message" colSpan={TABLE_COLUMNS}>
                      <FileWarning size={17} /> No records found.
                    </td>
                  </tr>
                ) : (
                  records.map((row, index) => {
                    const filingValue = normalizeLevel(row.filingStatus);
                    const defaultValue = normalizeLevel(row.defaultLevel);

                    const issued =
                      normalizeLevel(row.gstr3aStatus) === "ISSUED";

                    const eligible =
                      String(row.gstr3aEligible || "").toUpperCase() === "Y";

                    const sec62 =
                      String(row.section62Candidate || "").toUpperCase() ===
                      "Y";

                    const delay = toNumber(row.delayDays);

                    return (
                      <tr
                        key={`${row.gstin || "gstin"}-${
                          row.retPeriod || period
                        }-${index}`}
                      >
                        <td className="cell-sl">{page * size + index + 1}</td>

                        <td className="cell-gstin">{row.gstin || "—"}</td>

                        <td className="cell-taxpayer">
                          {row.taxpayerName ||
                            row.tradeName ||
                            row.legalName ||
                            "—"}
                        </td>

                        <td
                          className="cell-office"
                          title={row.officeName || row.stJuri || undefined}
                        >
                          {row.officeName || row.stJuri || "—"}
                        </td>

                        <td className="cell-date">{formatDate(row.dueDate)}</td>

                        <td>
                          <span
                            className={`ref-status filing-${badgeClass(
                              filingValue,
                            )}`}
                          >
                            {humanize(filingValue)}
                          </span>
                        </td>

                        <td className="cell-date">
                          {formatDate(row.filingDate)}
                        </td>

                        <td
                          className={`cell-delay ${
                            delay >= 30
                              ? "delay-critical"
                              : delay > 0
                                ? "delay-warning"
                                : "delay-normal"
                          }`}
                        >
                          {integer(row.delayDays)}
                        </td>

                        <td className="cell-money">{integer(row.outputTax)}</td>

                        <td>
                          <span
                            className={`ref-level level-${badgeClass(
                              defaultValue,
                            )}`}
                          >
                            {humanize(defaultValue)}
                          </span>
                        </td>

                        <td>
                          {issued ? (
                            <span className="ref-gstr issued">Issued</span>
                          ) : eligible ? (
                            <span className="ref-gstr eligible">Eligible</span>
                          ) : (
                            <span className="ref-neutral">No</span>
                          )}
                        </td>

                        <td>
                          {sec62 ? (
                            <span className="ref-sec62 yes">Yes</span>
                          ) : (
                            <span className="ref-neutral">No</span>
                          )}
                        </td>

                        <td className="cell-action">
                          <button
                            type="button"
                            className="ref-view-btn"
                            onClick={() => openDefaulterView(row)}
                            title={`View details for ${row.gstin || "GSTIN"}`}
                            aria-label={`View details for ${row.gstin || "GSTIN"}`}
                          >
                            <Eye size={13} />
                            <span>View</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="def-table-footer">
            Showing <strong>{integer(firstRecord)}</strong>&nbsp;to&nbsp;
            <strong>{integer(lastRecord)}</strong>&nbsp;of&nbsp;
            <strong>{integer(totalElements)}</strong>&nbsp;records
          </div>
        </section>
      </main>

      <GstDefaulterViewModal
        open={viewModalOpen}
        data={selectedDefaulter}
        onClose={closeDefaulterView}
        onGenerateNotice={() => {
          setRefreshKey((value) => value + 1);
        }}
      />
    </>
  );
}
