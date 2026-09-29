import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  IndianRupee,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
  X,
} from "lucide-react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  downloadGrowthCsv,
  fetchGrowthOffices,
  fetchGrowthPeriods,
  fetchGrowthSummary,
  fetchGrowthTaxpayers,
  fetchGrowthTrend,
  getGrowthApiErrorMessage,
} from "../services/gstGrowthService";

import "../styles/GstReturn3bGrowth.css";

/* =========================================================
   CONFIG
\\========================================================= */

const PAGE_SIZES = [10, 25, 50, 100];

const GROWTH_COLORS = {
  strongGrowth: "#047857",
  growth: "#22c55e",
  stable: "#2563eb",
  declining: "#f59e0b",
  sharpDecline: "#dc2626",
};

const EMPTY_PAGE = {
  content: [],
  totalElements: 0,
  totalPages: 0,
  page: 0,
  size: 10,
  first: true,
  last: true,
};

const EMPTY_SUMMARY = {
  totalGstins: 0,
  totalTaxableValue: 0,
  totalOutputTax: 0,
  totalEligibleItc: 0,
  totalCashTaxPaid: 0,
  avgMomTaxableGrowth: 0,
  avgMomOutputTaxGrowth: 0,
  avgYoyTaxableGrowth: 0,
  avgYoyOutputTaxGrowth: 0,
  strongGrowthCount: 0,
  growthCount: 0,
  stableCount: 0,
  declineCount: 0,
  strongDeclineCount: 0,
};

/* =========================================================
   FORMATTERS
\\========================================================= */

const numberValue = (value) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
};

const formatNumber = (value) =>
  new Intl.NumberFormat("en-IN").format(numberValue(value));

const formatMoney = (value) => {
  const amount = numberValue(value);

  if (Math.abs(amount) >= 10_000_000) {
    return `₹${(amount / 10_000_000).toFixed(2)} Cr`;
  }

  if (Math.abs(amount) >= 100_000) {
    return `₹${(amount / 100_000).toFixed(2)} L`;
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",

    currency: "INR",

    maximumFractionDigits: 0,
  }).format(amount);
};

const formatPercent = (value) => {
  const amount = numberValue(value);

  return `${amount > 0 ? "+" : ""}${amount.toFixed(2)}%`;
};

const getErrorMessage = (error) =>
  getGrowthApiErrorMessage?.(
    error,

    "Unable to load GST growth analytics.",
  ) ||
  error?.response?.data?.message ||
  error?.message ||
  "Unable to load GST growth analytics.";

const isCancelled = (error) =>
  error?.code === "ERR_CANCELED" ||
  error?.name === "CanceledError" ||
  error?.name === "AbortError";

/* =========================================================



   BADGES



\\========================================================= */

const GrowthBadge = ({ value }) => {
  const normalized = String(value || "NA")
    .trim()

    .toUpperCase()

    .replace(/[\s-]+/g, "\_");

  const labels = {
    STRONG_GROWTH: "Strong Growth",

    GROWTH: "Growth",

    STABLE: "Stable",

    DECLINING: "Declining",

    STRONG_DECLINE: "Strong Decline",

    NA: "Not Available",
  };

  return (
    <span
      className={`growth-badge growth-${normalized.toLowerCase().replaceAll("\_", "-")}`}
    >
      <span className="badge-dot" />

      {labels[normalized] || value || "Not Available"}
    </span>
  );
};

const RiskBadge = ({ value }) => {
  if (!value) {
    return (
      <span className="risk-badge risk-unassessed">
        <span className="badge-dot" />
        Not Assessed
      </span>
    );
  }

  const risk = String(value).trim().toUpperCase();

  return (
    <span className={`risk-badge risk-${risk.toLowerCase()}`}>
      <span className="badge-dot" />

      {risk}
    </span>
  );
};

const GrowthValue = ({ value }) => {
  const amount = numberValue(value);

  return (
    <span
      className={
        amount < 0
          ? "growth-value negative"
          : amount > 0
            ? "growth-value positive"
            : "growth-value neutral"
      }
    >
      {amount > 0 ? (
        <TrendingUp size={13} />
      ) : amount < 0 ? (
        <TrendingDown size={13} />
      ) : null}

      {formatPercent(amount)}
    </span>
  );
};

/* =========================================================



   KPI CARD



\\========================================================= */

const MetricCard = ({
  icon: Icon,

  title,

  value,

  subtext,

  tone = "blue",

  trend,
}) => (
  <article className={`growth-metric metric-${tone}`}>
    <div className="growth-metric-top">
      <div className="growth-metric-icon">
        <Icon size={20} />
      </div>

      {trend !== undefined && trend !== null && <GrowthValue value={trend} />}
    </div>

    <div className="growth-metric-content">
      <span>{title}</span>

      <strong>{value}</strong>

      {subtext && <small>{subtext}</small>}
    </div>
  </article>
);

const EmptyChart = ({ message }) => (
  <div className="growth-no-chart">
    <BarChart3 size={25} />

    <span>{message}</span>
  </div>
);

/* =========================================================



   MAIN PAGE



\\========================================================= */

export default function GstReturn3bGrowth() {
  const [periods, setPeriods] = useState([]);

  const [offices, setOffices] = useState([]);

  const [period, setPeriod] = useState("");

  const [office, setOffice] = useState("");

  const [trendFilter, setTrendFilter] = useState("");

  const [riskLevel, setRiskLevel] = useState("");

  const [searchInput, setSearchInput] = useState("");

  const [search, setSearch] = useState("");

  const [page, setPage] = useState(0);

  const [size, setSize] = useState(10);

  const [summary, setSummary] = useState(EMPTY_SUMMARY);

  const [trendData, setTrendData] = useState([]);

  const [pageData, setPageData] = useState(EMPTY_PAGE);

  const [initialLoading, setInitialLoading] = useState(true);

  const [loading, setLoading] = useState(false);

  const [exporting, setExporting] = useState(false);

  const [error, setError] = useState("");

  const refreshControllerRef = useRef(null);

  const exportControllerRef = useRef(null);

  /* =======================================================



     LOAD PERIODS



  ======================================================= */

  const loadPeriods = useCallback(async (signal) => {
    const result = await fetchGrowthPeriods({ signal });

    const valid = Array.isArray(result)
      ? result.filter((item) => item?.value)
      : [];

    setPeriods(valid);

    if (valid.length) {
      setPeriod((current) => current || valid[0].value);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        setInitialLoading(true);

        setError("");

        await loadPeriods(controller.signal);
      } catch (err) {
        if (!isCancelled(err)) {
          setError(getErrorMessage(err));
        }
      } finally {
        if (!controller.signal.aborted) {
          setInitialLoading(false);
        }
      }
    };

    load();

    return () => controller.abort();
  }, [loadPeriods]);

  /* =======================================================



     LOAD OFFICES



  ======================================================= */

  useEffect(() => {
    if (!period) {
      setOffices([]);

      return undefined;
    }

    const controller = new AbortController();

    const load = async () => {
      try {
        const result = await fetchGrowthOffices(period, {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setOffices(Array.isArray(result) ? result : []);
        }
      } catch (err) {
        if (!isCancelled(err)) {
          setError(getErrorMessage(err));
        }
      }
    };

    load();

    return () => controller.abort();
  }, [period]);

  /* =======================================================



     LOAD DASHBOARD



  ======================================================= */

  const loadDashboard = useCallback(
    async (signal) => {
      if (!period) return;

      setLoading(true);

      setError("");

      try {
        const [summaryResult, trendResult, rowsResult] = await Promise.all([
          fetchGrowthSummary(
            {
              period,

              office,
            },

            { signal },
          ),

          fetchGrowthTrend(
            {
              period,

              office,
            },

            { signal },
          ),

          fetchGrowthTaxpayers(
            {
              period,

              office,

              search,

              trend: trendFilter,

              riskLevel,

              page,

              size,
            },

            { signal },
          ),
        ]);

        if (signal.aborted) return;

        setSummary({
          ...EMPTY_SUMMARY,

          ...(summaryResult || {}),
        });

        setTrendData(Array.isArray(trendResult) ? trendResult : []);

        setPageData({
          ...EMPTY_PAGE,

          ...(rowsResult || {}),

          content: Array.isArray(rowsResult?.content) ? rowsResult.content : [],
        });
      } catch (err) {
        if (!isCancelled(err)) {
          setError(getErrorMessage(err));
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },

    [period, office, search, trendFilter, riskLevel, page, size],
  );

  useEffect(() => {
    if (!period) return undefined;

    const controller = new AbortController();

    loadDashboard(controller.signal);

    return () => controller.abort();
  }, [period, loadDashboard]);

  /* =======================================================



     SEARCH / FILTERS



  ======================================================= */

  const submitSearch = (event) => {
    event.preventDefault();

    setPage(0);

    setSearch(searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput("");

    setSearch("");

    setPage(0);
  };

  const resetFilters = () => {
    setOffice("");

    setTrendFilter("");

    setRiskLevel("");

    setSearchInput("");

    setSearch("");

    setPage(0);
  };

  const handlePeriod = (value) => {
    setPeriod(value);

    setOffice("");

    setPage(0);
  };

  const handleOffice = (value) => {
    setOffice(value);

    setPage(0);
  };

  const handleTrend = (value) => {
    setTrendFilter(value);

    setPage(0);
  };

  const handleRisk = (value) => {
    setRiskLevel(value);

    setPage(0);
  };

  /* =======================================================



     REFRESH



  ======================================================= */

  const handleRefresh = () => {
    if (!period || loading) return;

    refreshControllerRef.current?.abort();

    const controller = new AbortController();

    refreshControllerRef.current = controller;

    loadDashboard(controller.signal);
  };

  /* =======================================================



     EXPORT



  ======================================================= */

  const handleExport = async () => {
    if (!period || exporting) return;

    exportControllerRef.current?.abort();

    const controller = new AbortController();

    exportControllerRef.current = controller;

    try {
      setExporting(true);

      setError("");

      await downloadGrowthCsv(
        {
          period,

          office,

          search,

          trend: trendFilter,

          riskLevel,
        },

        {
          signal: controller.signal,
        },
      );
    } catch (err) {
      if (!isCancelled(err)) {
        setError(getErrorMessage(err));
      }
    } finally {
      if (!controller.signal.aborted) {
        setExporting(false);
      }
    }
  };

  useEffect(
    () => () => {
      refreshControllerRef.current?.abort();

      exportControllerRef.current?.abort();
    },

    [],
  );

  /* =======================================================



     CHART DATA



  ======================================================= */

  const chartData = useMemo(
    () =>
      trendData.map((item) => ({
        ...item,

        taxableValue: numberValue(item.taxableValue),

        outputTax: numberValue(item.outputTax),

        eligibleItc: numberValue(item.eligibleItc),

        cashTaxPaid: numberValue(item.cashTaxPaid),
      })),

    [trendData],
  );

  const distribution = useMemo(
    () => [
      {
        key: "strong-growth",

        label: "Strong Growth",

        value: numberValue(summary.strongGrowthCount),

        color: GROWTH_COLORS.strongGrowth,
      },

      {
        key: "growth",

        label: "Growth",

        value: numberValue(summary.growthCount),

        color: GROWTH_COLORS.growth,
      },

      {
        key: "stable",

        label: "Stable",

        value: numberValue(summary.stableCount),

        color: GROWTH_COLORS.stable,
      },

      {
        key: "declining",

        label: "Declining",

        value: numberValue(summary.declineCount),

        color: GROWTH_COLORS.declining,
      },

      {
        key: "sharp-decline",

        label: "Strong Decline",

        value: numberValue(summary.strongDeclineCount),

        color: GROWTH_COLORS.sharpDecline,
      },
    ],

    [summary],
  );

  const distributionTotal = useMemo(
    () =>
      distribution.reduce(
        (total, item) => total + numberValue(item.value),

        0,
      ),

    [distribution],
  );

  /* =======================================================



     ACTIVE FILTERS



  ======================================================= */

  const activeFilters = useMemo(() => {
    const values = [];

    if (office) {
      const selected = offices.find(
        (item) => String(item.value) === String(office),
      );

      values.push({
        key: "office",

        label: selected?.label || office,

        clear: () => {
          setOffice("");

          setPage(0);
        },
      });
    }

    if (trendFilter) {
      values.push({
        key: "trend",

        label: trendFilter

          .replaceAll("\_", " ")

          .toLowerCase()

          .replace(/\b\w/g, (letter) => letter.toUpperCase()),

        clear: () => {
          setTrendFilter("");

          setPage(0);
        },
      });
    }

    if (riskLevel) {
      values.push({
        key: "risk",

        label: `${riskLevel} Risk`,

        clear: () => {
          setRiskLevel("");

          setPage(0);
        },
      });
    }

    if (search) {
      values.push({
        key: "search",

        label: `Search: ${search}`,

        clear: clearSearch,
      });
    }

    return values;
  }, [office, offices, trendFilter, riskLevel, search]);

  /* =======================================================



     PAGINATION



  ======================================================= */

  const totalElements = numberValue(pageData.totalElements);

  const totalPages = numberValue(pageData.totalPages);

  const rangeStart = totalElements > 0 ? page * size + 1 : 0;

  const rangeEnd = Math.min(
    page * size + pageData.content.length,

    totalElements,
  );

  /* =======================================================



     INITIAL LOADING



  ======================================================= */

  if (initialLoading) {
    return (
      <div className="growth-page-state">
        <div className="growth-loading-card">
          <Loader2 className="spin" size={28} />

          <div>
            <strong>Loading GST Growth Analytics</strong>

            <span>Preparing return periods and dashboard data...</span>
          </div>
        </div>
      </div>
    );
  }

  /* =======================================================



     RENDER



  ======================================================= */

  return (
    <div className="gst-growth-page">
      {/* ===================================================



          HERO



      =================================================== */}

      <section className="growth-hero">
        <div className="growth-hero-main">
          <div className="growth-heading-icon">
            <BarChart3 size={23} />
          </div>

          <div>
            <h1>Growth &amp; Revenue Intelligence</h1>

            <p>
              Monitor taxpayer turnover, output tax, ITC utilisation, cash
              payment and growth behaviour.
            </p>
          </div>
        </div>

        <div className="growth-header-actions">
          <button
            type="button"
            className="growth-export-btn"
            onClick={handleExport}
            disabled={!period || loading || exporting}
          >
            {exporting ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Download size={16} />
            )}

            <span>{exporting ? "Exporting..." : "Export CSV"}</span>
          </button>

          <button
            type="button"
            className="growth-refresh-btn"
            onClick={handleRefresh}
            disabled={!period || loading}
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />

            <span>Refresh</span>
          </button>
        </div>
      </section>

      {/* ===================================================



          FILTERS



      =================================================== */}

      <section className="growth-filter-card">
        <header className="growth-filter-header">
          <div>
            <Filter size={17} />

            <div>
              <strong>Analytical Filters</strong>

              <span>Refine taxpayer growth analysis</span>
            </div>
          </div>

          {activeFilters.length > 0 && (
            <button
              type="button"
              className="growth-clear-all"
              onClick={resetFilters}
            >
              Clear all
            </button>
          )}
        </header>

        <div className="growth-filter-grid">
          <label>
            <span>
              Return Period <b>*</b>
            </span>

            <select
              value={period}
              onChange={(event) => handlePeriod(event.target.value)}
              disabled={periods.length === 0}
            >
              {periods.length === 0 && (
                <option value="">No return periods</option>
              )}

              {periods.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Office</span>

            <select
              value={office}
              onChange={(event) => handleOffice(event.target.value)}
            >
              <option value="">All Offices</option>

              {offices.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Growth Status</span>

            <select
              value={trendFilter}
              onChange={(event) => handleTrend(event.target.value)}
            >
              <option value="">All Growth Status</option>

              <option value="STRONG_GROWTH">Strong Growth</option>

              <option value="GROWTH">Growth</option>

              <option value="STABLE">Stable</option>

              <option value="DECLINING">Declining</option>

              <option value="STRONG_DECLINE">Sharp Decline</option>
            </select>
          </label>

          <label>
            <span>Risk Level</span>

            <select
              value={riskLevel}
              onChange={(event) => handleRisk(event.target.value)}
            >
              <option value="">All Risk Levels</option>

              <option value="HIGH">High Risk</option>

              <option value="MEDIUM">Medium Risk</option>

              <option value="LOW">Low Risk</option>
            </select>
          </label>

          <form className="growth-search" onSubmit={submitSearch}>
            <span>GSTIN / Trade Name</span>

            <div className="growth-search-control">
              <Search size={16} />

              <input
                value={searchInput}
                maxLength={100}
                autoComplete="off"
                placeholder="GSTIN or taxpayer name"
                onChange={(event) => setSearchInput(event.target.value)}
              />

              {searchInput && (
                <button
                  type="button"
                  className="growth-search-clear"
                  onClick={clearSearch}
                  aria-label="Clear taxpayer search"
                >
                  <X size={15} />
                </button>
              )}

              <button
                type="submit"
                className="growth-search-button"
                disabled={loading}
              >
                Search
              </button>
            </div>
          </form>

          <button
            type="button"
            className="growth-reset-button"
            onClick={resetFilters}
            disabled={activeFilters.length === 0}
          >
            Reset
          </button>
        </div>

        {activeFilters.length > 0 && (
          <div className="growth-active-filters">
            <span className="growth-active-label">Active:</span>

            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className="growth-filter-chip"
                onClick={filter.clear}
              >
                {filter.label}

                <X size={12} />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ===================================================



          ERROR



      =================================================== */}

      {error && (
        <div className="growth-error" role="alert">
          <AlertCircle size={19} />

          <div>
            <strong>Unable to load GST growth analytics</strong>

            <span>{error}</span>
          </div>

          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Close error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ===================================================



          KPI CARDS



      =================================================== */}

      <section className="growth-metrics-grid">
        <MetricCard
          icon={Users}
          title="Total GSTINs"
          value={formatNumber(summary.totalGstins)}
          subtext="Taxpayers analysed"
          tone="blue"
        />

        <MetricCard
          icon={IndianRupee}
          title="Taxable Value"
          value={formatMoney(summary.totalTaxableValue)}
          subtext="Selected return period"
          tone="green"
          trend={summary.avgMomTaxableGrowth}
        />

        <MetricCard
          icon={WalletCards}
          title="Output Tax"
          value={formatMoney(summary.totalOutputTax)}
          subtext="Total tax liability"
          tone="red"
          trend={summary.avgMomOutputTaxGrowth}
        />

        <MetricCard
          icon={ShieldAlert}
          title="Eligible ITC"
          value={formatMoney(summary.totalEligibleItc)}
          subtext="Input tax credit"
          tone="purple"
        />

        <MetricCard
          icon={Building2}
          title="Cash Tax Paid"
          value={formatMoney(summary.totalCashTaxPaid)}
          subtext="Cash component"
          tone="orange"
        />

        <MetricCard
          icon={TrendingUp}
          title="Avg. MoM Growth"
          value={formatPercent(summary.avgMomOutputTaxGrowth)}
          subtext="Output tax movement"
          tone="cyan"
        />

        <MetricCard
          icon={TrendingUp}
          title="Avg. YoY Growth"
          value={formatPercent(summary.avgYoyOutputTaxGrowth)}
          subtext="Output tax movement"
          tone="indigo"
        />

        <MetricCard
          icon={TrendingDown}
          title="Declining GSTINs"
          value={formatNumber(
            numberValue(summary.declineCount) +
              numberValue(summary.strongDeclineCount),
          )}
          subtext="Requires analytical review"
          tone="amber"
        />
      </section>

      {/* ===================================================



          CHARTS



      =================================================== */}

      <section className="growth-chart-grid">
        {/* Revenue trend */}

        <article className="growth-chart-card growth-chart-wide">
          <header>
            <div>
              <h2>Revenue Growth Trend</h2>

              <p>
                Taxable value and output tax across available return periods
              </p>
            </div>

            <span className="growth-chart-tag">Trend</span>
          </header>

          <div className="growth-chart-body">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height={285}>
                <LineChart
                  data={chartData}
                  margin={{
                    top: 8,

                    right: 15,

                    left: 5,

                    bottom: 0,
                  }}
                >
                  <CartesianGrid
                    stroke="#e2e8f0"
                    strokeDasharray="4 4"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontSize: 12,

                      fontWeight: 600,

                      fill: "#475569",
                    }}
                  />

                  <YAxis
                    width={78}
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontSize: 11,

                      fontWeight: 600,

                      fill: "#475569",
                    }}
                    tickFormatter={formatMoney}
                  />

                  <Tooltip
                    formatter={(value, name) => [formatMoney(value), name]}
                    contentStyle={{
                      borderRadius: "8px",

                      border: "1px solid #dbe4ed",

                      boxShadow: "0 8px 24px rgba(15,23,42,.08)",

                      fontSize: "12px",

                      fontWeight: 600,
                    }}
                  />

                  <Legend
                    wrapperStyle={{
                      fontSize: "12px",

                      fontWeight: 600,

                      color: "#334155",
                    }}
                  />

                  <Line
                    type="monotone"
                    dataKey="taxableValue"
                    name="Taxable Value"
                    stroke="#15579a"
                    strokeWidth={2.5}
                    dot={{
                      r: 3,

                      fill: "#15579a",
                    }}
                    activeDot={{ r: 5 }}
                  />

                  <Line
                    type="monotone"
                    dataKey="outputTax"
                    name="Output Tax"
                    stroke="#047857"
                    strokeWidth={2.5}
                    dot={{
                      r: 3,

                      fill: "#047857",
                    }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No revenue trend data available." />
            )}
          </div>
        </article>

        {/* Tax composition */}

        <article className="growth-chart-card">
          <header>
            <div>
              <h2>Tax Payment Composition</h2>

              <p>Output tax, eligible ITC and cash payment</p>
            </div>

            <span className="growth-chart-tag">Tax</span>
          </header>

          <div className="growth-chart-body">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height={285}>
                <BarChart
                  data={chartData}
                  margin={{
                    top: 8,

                    right: 10,

                    left: 5,

                    bottom: 0,
                  }}
                >
                  <CartesianGrid
                    stroke="#e2e8f0"
                    strokeDasharray="4 4"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontSize: 12,

                      fontWeight: 600,

                      fill: "#475569",
                    }}
                  />

                  <YAxis
                    width={78}
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontSize: 11,

                      fontWeight: 600,

                      fill: "#475569",
                    }}
                    tickFormatter={formatMoney}
                  />

                  <Tooltip
                    formatter={(value, name) => [formatMoney(value), name]}
                    contentStyle={{
                      borderRadius: "8px",

                      border: "1px solid #dbe4ed",

                      fontSize: "12px",

                      fontWeight: 600,
                    }}
                  />

                  <Legend
                    wrapperStyle={{
                      fontSize: "12px",

                      fontWeight: 600,

                      color: "#334155",
                    }}
                  />

                  <Bar
                    dataKey="outputTax"
                    name="Output Tax"
                    fill="#15579a"
                    radius={[3, 3, 0, 0]}
                  />

                  <Bar
                    dataKey="eligibleItc"
                    name="Eligible ITC"
                    fill="#6941c6"
                    radius={[3, 3, 0, 0]}
                  />

                  <Bar
                    dataKey="cashTaxPaid"
                    name="Cash Paid"
                    fill="#047857"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No tax composition data available." />
            )}
          </div>
        </article>

        {/* Growth distribution */}

        <article className="growth-chart-card growth-distribution-card">
          <header>
            <div>
              <h2>Growth Distribution</h2>

              <p>Selected return period classification</p>
            </div>

            <span className="growth-chart-tag">Distribution</span>
          </header>

          <div className="growth-distribution-layout">
            {distributionTotal > 0 ? (
              <div className="growth-donut">
                <ResponsiveContainer width="100%" height={185}>
                  <PieChart>
                    <Pie
                      data={distribution}
                      dataKey="value"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={73}
                      paddingAngle={2}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {distribution.map((item) => (
                        <Cell key={item.key} fill={item.color} />
                      ))}
                    </Pie>

                    <Tooltip
                      formatter={(value, name) => [formatNumber(value), name]}
                      contentStyle={{
                        borderRadius: "8px",

                        border: "1px solid #dbe4ed",

                        fontSize: "12px",

                        fontWeight: 600,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="growth-donut-center">
                  <strong>{formatNumber(distributionTotal)}</strong>

                  <span>GSTINs</span>
                </div>
              </div>
            ) : (
              <EmptyChart message="No distribution available." />
            )}

            <div className="growth-distribution">
              {distribution.map((item) => (
                <div
                  className={`growth-distribution-row distribution-${item.key}`}
                  key={item.key}
                >
                  <span>
                    <i />

                    {item.label}
                  </span>

                  <strong>{formatNumber(item.value)}</strong>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>

      {/* ===================================================



          TABLE



      =================================================== */}

      <section className="growth-table-card">
        <header className="growth-table-header">
          <div className="growth-table-title">
            <div className="growth-table-title-icon">
              <Users size={17} />
            </div>

            <div>
              <h2>GSTIN Growth Details</h2>

              <p>Dealer and jurisdiction-wise revenue growth analysis</p>
            </div>
          </div>

          <div className="growth-record-count">
            <span>Total Records</span>

            <strong>{formatNumber(pageData.totalElements)}</strong>
          </div>
        </header>

        <div className="growth-table-scroll">
          <table className="growth-table">
            <thead>
              <tr>
                <th className="serial-column">#</th>

                <th>Taxpayer</th>

                <th>Office</th>

                <th className="numeric">Taxable Value</th>

                <th className="numeric">Output Tax</th>

                <th className="numeric">Eligible ITC</th>

                <th className="numeric">Cash Paid</th>

                <th className="numeric">MoM Taxable</th>

                <th className="numeric">MoM Output</th>

                <th className="numeric">YoY Output</th>

                <th>Growth Status</th>

                <th>Risk</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="growth-table-state">
                    <div className="growth-table-loading">
                      <Loader2 className="spin" size={22} />

                      <span>Loading growth records...</span>
                    </div>
                  </td>
                </tr>
              ) : pageData.content.length === 0 ? (
                <tr>
                  <td colSpan={12} className="growth-table-state">
                    <div className="growth-empty-table">
                      <Search size={25} />

                      <strong>No GST growth records found</strong>

                      <span>Change the selected filters and try again.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                pageData.content.map((row, index) => (
                  <tr key={`${row.gstin}-${row.retPeriod}-${index}`}>
                    <td className="serial-column">{page * size + index + 1}</td>

                    <td>
                      <div className="growth-taxpayer">
                        <strong>{row.gstin || "—"}</strong>

                        <span>{row.tradeName || "Trade name unavailable"}</span>
                      </div>
                    </td>

                    <td>
                      <div className="growth-office">
                        <strong>{row.officeName || "Unmapped"}</strong>

                        <span>{row.stJuri || "—"}</span>
                      </div>
                    </td>

                    <td className="numeric money-cell">
                      {formatMoney(row.taxableValue)}
                    </td>

                    <td className="numeric money-cell">
                      {formatMoney(row.outputTax)}
                    </td>

                    <td className="numeric money-cell">
                      {formatMoney(row.eligibleItc)}
                    </td>

                    <td className="numeric money-cell">
                      {formatMoney(row.cashTaxPaid)}
                    </td>

                    <td className="numeric">
                      <GrowthValue value={row.momTaxableGrowth} />
                    </td>

                    <td className="numeric">
                      <GrowthValue value={row.momOutputTaxGrowth} />
                    </td>

                    <td className="numeric">
                      <GrowthValue value={row.yoyOutputTaxGrowth} />
                    </td>
                    <td>
                      <GrowthBadge value={row.growthTrend} />
                    </td>

                    <td>
                      <RiskBadge value={row.riskLevel} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* =================================================



            PAGINATION



        ================================================= */}

        <footer className="growth-pagination">
          <div className="growth-pagination-info">
            Showing <strong>{rangeStart}</strong>
            {" – "}
            <strong>{rangeEnd}</strong>
            {" of "}
            <strong>{formatNumber(totalElements)}</strong>
          </div>

          <div className="growth-pagination-actions">
            <label>
              <span>Rows per page</span>

              <select
                value={size}
                onChange={(event) => {
                  setSize(Number(event.target.value));

                  setPage(0);
                }}
                disabled={loading}
              >
                {PAGE_SIZES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <div className="growth-page-number">
              Page <strong>{totalPages ? page + 1 : 0}</strong>
              {" of "}
              <strong>{totalPages}</strong>
            </div>

            <div className="growth-page-buttons">
              <button
                type="button"
                disabled={page <= 0 || loading}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                aria-label="Previous page"
                title="Previous page"
              >
                <ChevronLeft size={17} />
              </button>

              <button
                type="button"
                disabled={pageData.last || loading || totalPages === 0}
                onClick={() => setPage((current) => current + 1)}
                aria-label="Next page"
                title="Next page"
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}
