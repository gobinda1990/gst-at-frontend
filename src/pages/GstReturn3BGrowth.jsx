import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useOutletContext } from "react-router-dom";

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

   CONFIGURATION

========================================================= */

const PAGE_SIZES = [10, 25, 50, 100];

const COLORS = {
  strongGrowth: "#047857",

  growth: "#22c55e",

  stable: "#2563eb",

  declining: "#f59e0b",

  strongDecline: "#dc2626",
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

   COMMON HELPERS

========================================================= */

const numberValue = (value) => {
  const n = Number(value);

  return Number.isFinite(n) ? n : 0;
};

const formatNumber = (value) =>
  new Intl.NumberFormat("en-IN").format(numberValue(value));

const formatMoney = (value) => {
  const amount = numberValue(value);

  if (Math.abs(amount) >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)} Cr`;
  }

  if (Math.abs(amount) >= 100000) {
    return `₹${(amount / 100000).toFixed(2)} L`;
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",

    currency: "INR",

    maximumFractionDigits: 0,
  }).format(amount);
};

const formatPercent = (value) => {
  if (value == null || value === "") {
    return "N/A";
  }

  const n = numberValue(value);

  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
};

const getErrorMessage = (error) =>
  getGrowthApiErrorMessage?.(error, "Unable to load GST growth analytics.") ||
  error?.response?.data?.message ||
  error?.message ||
  "Unable to load GST growth analytics.";

const isCancelled = (error) =>
  error?.code === "ERR_CANCELED" ||
  error?.name === "CanceledError" ||
  error?.name === "AbortError";

const normalizeRole = (value) =>
  String(value ?? "")
    .trim()

    .toUpperCase()

    .replace(/^ROLE_/, "")

    .replace(/[\s-]+/g, "_");

/*

 * Role handling:

 *

 * SUPER_ADMIN -> all offices

 * ADMIN       -> backend assigned offices

 * USER        -> backend assigned offices

 *

 * Both roleId and roleName null:

 * legacy SUPER_ADMIN, as requested.

 *

 * The backend must independently validate this rule.

 */

const resolveRole = (authUser) => {
  if (!authUser) return "UNAUTHORIZED";

  const roleId = authUser.roleId;
  const roleName = normalizeRole(authUser.roleName);
  const emptyId = roleId == null || String(roleId).trim() === "";

  // Legacy portal convention: both fields absent = Super Admin.
  // The API must verify this privilege independently.
  if (emptyId && !roleName) return "SUPER_ADMIN";

  switch (roleName) {
    case "SUPER_ADMIN":
      return "SUPER_ADMIN";
    case "ADMIN":
      return "ADMIN";
    case "USER":
      return "USER";
    default:
      return "UNAUTHORIZED";
  }
};

/* =========================================================

   API RESPONSE NORMALIZATION

========================================================= */

const unwrapList = (response) => {
  if (Array.isArray(response)) return response;

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response?.content)) {
    return response.content;
  }

  if (Array.isArray(response?.data?.content)) {
    return response.data.content;
  }

  return [];
};

const normalizeOptions = (response, type) =>
  unwrapList(response)
    .map((item) => {
      if (typeof item === "string" || typeof item === "number") {
        return {
          value: String(item),

          label: String(item),
        };
      }

      const value = String(
        item?.value ??
          (type === "office"
            ? (item?.officeId ?? item?.officeCode)
            : (item?.period ?? item?.retPeriod)) ??
          "",
      ).trim();

      const label = String(
        item?.label ??
          (type === "office" ? item?.officeName : item?.periodLabel) ??
          value,
      ).trim();

      return { value, label };
    })

    .filter((item) => item.value);

const normalizePage = (response, size) => {
  const data = response?.data ?? response ?? {};

  return {
    ...EMPTY_PAGE,

    ...data,

    content: Array.isArray(data.content) ? data.content : [],

    totalElements: numberValue(data.totalElements),

    totalPages: numberValue(data.totalPages),

    size,
  };
};

/* =========================================================

   GROWTH BADGE

========================================================= */

const GrowthBadge = ({ value }) => {
  const status = String(value || "NA")
    .trim()

    .toUpperCase()

    .replace(/[\s-]+/g, "_");

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
      className={`growth-badge growth-${status

        .toLowerCase()

        .replaceAll("_", "-")}`}
    >
      <span className="badge-dot" />

      {labels[status] || value || "Not Available"}
    </span>
  );
};

/* =========================================================

   RISK BADGE

========================================================= */

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

/* =========================================================

   GROWTH VALUE

========================================================= */

const GrowthValue = ({ value }) => {
  if (value == null) {
    return <span className="growth-value neutral">N/A</span>;
  }

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

========================================================= */

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

      {trend != null && <GrowthValue value={trend} />}
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

   MAIN DASHBOARD

========================================================= */

export default function GstReturn3bGrowth() {
  /*

   * AuthGate should pass:

   *

   * <Outlet context={{ authUser }} />

   *

   * authUser:

   * {

   *   roleId,

   *   roleName,

   *   projectId,

   *   user

   * }

   */

  const context = useOutletContext();

  const authUser = context?.authUser ?? null;

  const role = useMemo(() => resolveRole(authUser), [authUser]);

  const isSuperAdmin = role === "SUPER_ADMIN";

  const authorized = role !== "UNAUTHORIZED";

  /* -------------------------------------------------------

     STATE

  ------------------------------------------------------- */

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

  const [officesLoading, setOfficesLoading] = useState(false);

  const [officePeriodReady, setOfficePeriodReady] = useState("");

  const [loading, setLoading] = useState(false);

  const [exporting, setExporting] = useState(false);

  const [error, setError] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);

  const exportControllerRef = useRef(null);

  /* =======================================================

     EFFECTIVE OFFICE

  ======================================================= */

  /*

   * Backend /offices already filters by JWT.

   *

   * SUPER_ADMIN:

   *   "" means All Offices.

   *

   * ADMIN / USER:

   *   One office -> automatically selected.

   *   Multiple -> select an authorized office.

   *

   * Never allow a restricted user to request office="".

   */

  const officesReady = Boolean(period) && officePeriodReady === period;

  const effectiveOffice = useMemo(() => {
    if (!officesReady || !authorized) {
      return "";
    }

    if (isSuperAdmin) {
      return office;
    }

    if (offices.length === 1) {
      return offices[0].value;
    }

    const permitted = offices.some((item) => item.value === office);

    return permitted ? office : "";
  }, [officesReady, authorized, isSuperAdmin, office, offices]);

  const canLoadDashboard =
    authorized &&
    Boolean(period) &&
    officesReady &&
    (isSuperAdmin ||
      (Boolean(effectiveOffice) &&
        offices.some((item) => item.value === effectiveOffice)));

  /* =======================================================

     LOAD RETURN PERIODS

  ======================================================= */

  useEffect(() => {
    if (!authorized) {
      setInitialLoading(false);

      return undefined;
    }

    const controller = new AbortController();

    const load = async () => {
      try {
        setInitialLoading(true);

        setError("");

        const response = await fetchGrowthPeriods({
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const list = normalizeOptions(response, "period");

        setPeriods(list);

        setPeriod((current) =>
          list.some((item) => item.value === current)
            ? current
            : (list[0]?.value ?? ""),
        );
      } catch (err) {
        if (!controller.signal.aborted && !isCancelled(err)) {
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
  }, [authorized]);

  /* =======================================================

     LOAD OFFICES FROM BACKEND

  ======================================================= */

  useEffect(() => {
    if (!period || !authorized) {
      setOffices([]);

      setOfficePeriodReady("");

      return undefined;
    }

    const controller = new AbortController();

    const load = async () => {
      setOfficesLoading(true);

      setOfficePeriodReady("");

      setOffices([]);

      setSummary(EMPTY_SUMMARY);

      setTrendData([]);

      setPageData(EMPTY_PAGE);

      try {
        /*

         * GET /gst/return-3b/growth/offices

         *

         * Backend decides office access:

         *

         * SUPER_ADMIN -> service.getOffices(period)

         *

         * ADMIN/USER ->

         * service.findChargeCdOffices(officeId)

         */

        const response = await fetchGrowthOffices(period, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const list = normalizeOptions(response, "office");

        const unique = Array.from(
          new Map(list.map((item) => [item.value, item])).values(),
        );

        setOffices(unique);

        setOfficePeriodReady(period);
      } catch (err) {
        if (!controller.signal.aborted && !isCancelled(err)) {
          setError(getErrorMessage(err));
        }
      } finally {
        if (!controller.signal.aborted) {
          setOfficesLoading(false);
        }
      }
    };

    load();

    return () => controller.abort();
  }, [period, authorized]);

  /* =======================================================

     AUTO SELECT OFFICE

  ======================================================= */

  useEffect(() => {
    if (!officesReady) return;

    if (isSuperAdmin) {
      setOffice((current) =>
        current && !offices.some((item) => item.value === current)
          ? ""
          : current,
      );

      return;
    }

    if (offices.length === 1) {
      setOffice(offices[0].value);

      setPage(0);

      return;
    }

    setOffice((current) =>
      offices.some((item) => item.value === current) ? current : "",
    );
  }, [officesReady, isSuperAdmin, offices]);

  /* =======================================================

     DASHBOARD DATA

  ======================================================= */

  const loadDashboard = useCallback(
    async (signal) => {
      if (!canLoadDashboard) return;

      setLoading(true);

      setError("");

      const params = {
        period,

        office: effectiveOffice,
      };

      try {
        const [summaryResponse, trendResponse, rowsResponse] =
          await Promise.all([
            fetchGrowthSummary(params, { signal }),

            fetchGrowthTrend(params, { signal }),

            fetchGrowthTaxpayers(
              {
                ...params,

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

          ...(summaryResponse?.data ?? summaryResponse ?? {}),
        });

        setTrendData(unwrapList(trendResponse));

        setPageData(normalizePage(rowsResponse, size));
      } catch (err) {
        if (!signal.aborted && !isCancelled(err)) {
          setError(getErrorMessage(err));

          setSummary(EMPTY_SUMMARY);

          setTrendData([]);

          setPageData(EMPTY_PAGE);
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },

    [
      canLoadDashboard,

      period,

      effectiveOffice,

      search,

      trendFilter,

      riskLevel,

      page,

      size,
    ],
  );

  useEffect(() => {
    if (!canLoadDashboard) {
      setSummary(EMPTY_SUMMARY);

      setTrendData([]);

      setPageData(EMPTY_PAGE);

      return undefined;
    }

    const controller = new AbortController();

    loadDashboard(controller.signal);

    return () => controller.abort();
  }, [canLoadDashboard, loadDashboard, refreshKey]);

  /* =======================================================

     FILTER HANDLERS

  ======================================================= */

  const handlePeriod = (value) => {
    setPeriod(value);

    setOffice("");

    setPage(0);
  };

  const handleOffice = (value) => {
    if (!isSuperAdmin) {
      const permitted = offices.some((item) => item.value === value);

      if (!permitted) return;
    }

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
    if (isSuperAdmin) {
      setOffice("");
    } else {
      setOffice(offices.length === 1 ? offices[0].value : "");
    }

    setTrendFilter("");

    setRiskLevel("");

    setSearchInput("");

    setSearch("");

    setPage(0);
  };

  /* =======================================================

     REFRESH

  ======================================================= */

  const handleRefresh = () => {
    if (!canLoadDashboard || loading) return;

    setRefreshKey((current) => current + 1);
  };

  /* =======================================================

     EXPORT CSV

  ======================================================= */

  const handleExport = async () => {
    if (!canLoadDashboard || exporting || loading) {
      return;
    }

    exportControllerRef.current?.abort();

    const controller = new AbortController();

    exportControllerRef.current = controller;

    try {
      setExporting(true);

      setError("");

      await downloadGrowthCsv(
        {
          period,

          office: effectiveOffice,

          search,

          trend: trendFilter,

          riskLevel,
        },

        { signal: controller.signal },
      );
    } catch (err) {
      if (!controller.signal.aborted && !isCancelled(err)) {
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

        color: COLORS.strongGrowth,
      },

      {
        key: "growth",

        label: "Growth",

        value: numberValue(summary.growthCount),

        color: COLORS.growth,
      },

      {
        key: "stable",

        label: "Stable",

        value: numberValue(summary.stableCount),

        color: COLORS.stable,
      },

      {
        key: "declining",

        label: "Declining",

        value: numberValue(summary.declineCount),

        color: COLORS.declining,
      },

      {
        key: "sharp-decline",

        label: "Strong Decline",

        value: numberValue(summary.strongDeclineCount),

        color: COLORS.strongDecline,
      },
    ],

    [summary],
  );

  const distributionTotal = distribution.reduce(
    (total, item) => total + item.value,

    0,
  );

  /* =======================================================

     ACTIVE FILTERS

  ======================================================= */

  const activeFilters = [];

  if (office && isSuperAdmin) {
    activeFilters.push({
      key: "office",

      label: offices.find((item) => item.value === office)?.label || office,

      clear: () => {
        setOffice("");

        setPage(0);
      },
    });
  }

  if (trendFilter) {
    activeFilters.push({
      key: "trend",

      label: trendFilter.replaceAll("_", " "),

      clear: () => {
        setTrendFilter("");

        setPage(0);
      },
    });
  }

  if (riskLevel) {
    activeFilters.push({
      key: "risk",

      label: `${riskLevel} Risk`,

      clear: () => {
        setRiskLevel("");

        setPage(0);
      },
    });
  }

  if (search) {
    activeFilters.push({
      key: "search",

      label: `Search: ${search}`,

      clear: clearSearch,
    });
  }

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
          <Loader2 size={28} className="spin" />

          <div>
            <strong>Loading GST Growth Analytics</strong>

            <span>Preparing return periods and office access...</span>
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
      {/* HERO */}

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
            disabled={!canLoadDashboard || loading || exporting}
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
            disabled={!canLoadDashboard || loading}
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />

            <span>Refresh</span>
          </button>
        </div>
      </section>

      {/* FILTERS */}

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
          {/* PERIOD */}

          <label>
            <span>
              Return Period <b>*</b>
            </span>

            <select
              value={period}
              onChange={(event) => handlePeriod(event.target.value)}
              disabled={!authorized || periods.length === 0}
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

          {/* OFFICE */}

          <label>
            <span>Office {!isSuperAdmin && <b>*</b>}</span>

            <select
              value={isSuperAdmin ? office : effectiveOffice}
              onChange={(event) => handleOffice(event.target.value)}
              disabled={
                !authorized ||
                officesLoading ||
                !officesReady ||
                (!isSuperAdmin && offices.length <= 1)
              }
            >
              {isSuperAdmin && <option value="">All Offices</option>}

              {!isSuperAdmin && offices.length !== 1 && (
                <option value="">
                  {officesLoading
                    ? "Loading offices..."
                    : offices.length === 0
                      ? "No Assigned Office"
                      : "Select Assigned Office"}
                </option>
              )}

              {offices.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          {/* GROWTH STATUS */}

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

          {/* RISK */}

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

          {/* SEARCH */}

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
                disabled={!canLoadDashboard || loading}
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

      {/* AUTHORIZATION WARNING */}

      {!authorized && (
        <div className="growth-error" role="alert">
          <ShieldAlert size={19} />

          <div>
            <strong>Authorization information unavailable</strong>

            <span>
              Open this module through the portal with a valid authenticated
              session.
            </span>
          </div>
        </div>
      )}

      {/* OFFICE WARNING */}

      {authorized && !isSuperAdmin && officesReady && offices.length === 0 && (
        <div className="growth-error" role="alert">
          <ShieldAlert size={19} />

          <div>
            <strong>No assigned office available</strong>

            <span>
              Your account has no office assignment for the selected return
              period.
            </span>
          </div>
        </div>
      )}

      {/* ERROR */}

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

      {/* KPI CARDS */}

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

      {/* CHARTS */}

      <section className="growth-chart-grid">
        {/* REVENUE TREND */}

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
            {chartData.length > 0 ? (
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
                    tickFormatter={formatMoney}
                  />

                  <Tooltip
                    formatter={(value, name) => [formatMoney(value), name]}
                  />

                  <Legend />

                  <Line
                    type="monotone"
                    dataKey="taxableValue"
                    name="Taxable Value"
                    stroke="#15579a"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />

                  <Line
                    type="monotone"
                    dataKey="outputTax"
                    name="Output Tax"
                    stroke="#047857"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No revenue trend data available." />
            )}
          </div>
        </article>

        {/* TAX COMPOSITION */}

        <article className="growth-chart-card">
          <header>
            <div>
              <h2>Tax Payment Composition</h2>

              <p>Output tax, eligible ITC and cash payment</p>
            </div>

            <span className="growth-chart-tag">Tax</span>
          </header>

          <div className="growth-chart-body">
            {chartData.length > 0 ? (
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

                  <XAxis dataKey="label" axisLine={false} tickLine={false} />

                  <YAxis
                    width={78}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={formatMoney}
                  />

                  <Tooltip
                    formatter={(value, name) => [formatMoney(value), name]}
                  />

                  <Legend />

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

        {/* DISTRIBUTION */}

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

      {/* TABLE */}

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

            <strong>{formatNumber(totalElements)}</strong>
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
              ) : !canLoadDashboard ? (
                <tr>
                  <td colSpan={12} className="growth-table-state">
                    <div className="growth-empty-table">
                      <ShieldAlert size={25} />

                      <strong>Office selection required</strong>

                      <span>
                        Select an authorized office to view GST growth records.
                      </span>
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

        {/* PAGINATION */}

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
                disabled={loading || totalPages === 0 || page + 1 >= totalPages}
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
