import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coins,
  Download,
  Eye,
  FileText,
  IndianRupee,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  WalletCards,
} from "lucide-react";

import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import {
  exportOfficeRevenue,
  fetchOfficeRevenueList,
  fetchOfficeRevenueOffices,
  fetchOfficeRevenuePeriods,
  fetchOfficeRevenueSummary,
  fetchOfficeRevenueTrend,
} from "../services/officeRevenueService";

import "./OfficeRevenueDashboard.css";

/* =========================================================

   CONFIGURATION

\========================================================= */

const DEFAULT_PAGE_SIZE = 25;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const TREND_MONTHS = 13;

const TREND_DISPLAY = 12;

const INR_CRORE = 10_000_000;

const GROWTH_OPTIONS = [
  { value: "HIGH", label: "High" },

  { value: "MEDIUM", label: "Medium" },

  { value: "LOW", label: "Low" },

  { value: "STABLE", label: "Stable" },

  { value: "DECLINING", label: "Declining" },

  { value: "NO_BASE", label: "No Base" },
];

const TAX_COLORS = {
  IGST: "#2563eb",

  CGST: "#16a34a",

  SGST: "#f59e0b",

  CESS: "#7c3aed",
};

const EMPTY_SUMMARY = {
  totalOffices: 0,

  totalFiledGstins: 0,

  totalTaxableValue: 0,

  totalOutputTax: 0,

  totalIgst: 0,

  totalCgst: 0,

  totalSgst: 0,

  totalCess: 0,

  totalEligibleItc: 0,

  totalUtilizedItc: 0,

  totalCashTaxPaid: 0,

  filingRate: null,

  filingRateMomGrowth: null,

  filedOnTime: null,

  filedLate: null,

  notFiled: null,
};

/* =========================================================

   HELPERS

\========================================================= */

const number = (value) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
};

const nullableNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const firstDefined = (...values) =>
  values.find((value) => value !== null && value !== undefined && value !== "");

const toCrore = (value) => number(value) / INR_CRORE;

const nullableCrore = (value) => {
  const parsed = nullableNumber(value);

  return parsed === null ? null : parsed / INR_CRORE;
};

const formatIndianNumber = (value, decimals = 2) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,

    maximumFractionDigits: decimals,
  }).format(number(value));

const formatInteger = (value) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    number(value),
  );

const formatCroreValue = (value, decimals = 2) =>
  formatIndianNumber(toCrore(value), decimals);

const formatCrore = (value, decimals = 2) =>
  `₹ ${formatCroreValue(value, decimals)} Cr`;

const formatFullRupees = (value, decimals = 2) =>
  `₹ ${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(number(value))}`;

const formatCroreChart = (croreValue, decimals = 2) =>
  `₹ ${formatIndianNumber(croreValue, decimals)} Cr`;

const formatPercent = (value) => {
  const parsed = nullableNumber(value);

  return parsed === null ? "—" : `${parsed.toFixed(2)}%`;
};

const compactCrore = (value) =>
  new Intl.NumberFormat("en-IN", {
    notation: "compact",

    maximumFractionDigits: 1,
  }).format(number(value));

const PERIOD_RE = /^(0[1-9]|1[0-2])\d{4}$/;

const periodLabel = (value) => {
  if (!value || !PERIOD_RE.test(String(value))) return value || "—";

  const text = String(value);

  const month = Number(text.substring(0, 2));

  const year = text.substring(2);

  const label = new Date(2000, month - 1, 1).toLocaleString("en-IN", {
    month: "long",
  });

  return `${label} ${year}`;
};

const shortPeriodLabel = (value) => {
  if (!value || !PERIOD_RE.test(String(value))) return value || "";

  const text = String(value);

  const month = Number(text.substring(0, 2));

  const year = text.substring(4);

  const label = new Date(2000, month - 1, 1).toLocaleString("en-IN", {
    month: "short",
  });

  return `${label}-${year}`;
};

const periodKey = (value) => {
  const text = String(value || "");

  return PERIOD_RE.test(text)
    ? Number(text.substring(2)) * 100 + Number(text.substring(0, 2))
    : 0;
};

const shiftPeriod = (value, months) => {
  const text = String(value || "");

  if (!PERIOD_RE.test(text)) return "";

  const month = Number(text.substring(0, 2));

  const year = Number(text.substring(2));

  const date = new Date(year, month - 1 + months, 1);

  return `${String(date.getMonth() + 1).padStart(2, "0")}${date.getFullYear()}`;
};

const pctChange = (current, previous) => {
  const cur = nullableNumber(current);

  const prev = nullableNumber(previous);

  if (cur === null || prev === null || prev === 0) return null;

  return ((cur - prev) / Math.abs(prev)) * 100;
};

const isAbort = (err) =>
  err?.code === "ERR_CANCELED" ||
  err?.name === "CanceledError" ||
  err?.name === "AbortError";

const apiMessage = (err, fallback) =>
  err?.response?.data?.message ||
  err?.response?.data?.error ||
  err?.message ||
  fallback;

const normalizeOptions = (data) => {
  const rows = Array.isArray(data)
    ? data
    : (data?.content ?? data?.data ?? data?.items ?? []);

  return rows

    .map((item) => {
      if (typeof item === "string") {
        return {
          value: item,

          label: PERIOD_RE.test(item) ? periodLabel(item) : item,
        };
      }

      const value =
        item?.value ??
        item?.retPeriod ??
        item?.stJuri ??
        item?.officeCode ??
        "";

      const label =
        item?.label ??
        item?.officeName ??
        (PERIOD_RE.test(String(value)) ? periodLabel(String(value)) : value);

      return {
        value: String(value ?? ""),

        label: String(label ?? value ?? ""),
      };
    })

    .filter((item) => item.value);
};

const normalizeSummary = (raw) => {
  const source = raw?.data ?? raw?.summary ?? raw ?? {};

  return {
    ...EMPTY_SUMMARY,

    ...source,

    totalOffices: number(
      firstDefined(source.totalOffices, source.offices, source.officeCount),
    ),

    totalFiledGstins: number(
      firstDefined(
        source.totalFiledGstins,

        source.filedGstins,

        source.totalGstins,
      ),
    ),

    totalTaxableValue: number(
      firstDefined(source.totalTaxableValue, source.taxableValue),
    ),

    totalOutputTax: number(
      firstDefined(source.totalOutputTax, source.outputTax),
    ),

    totalIgst: number(
      firstDefined(
        source.totalIgst,

        source.igst,

        source.igstAmount,

        source.totalIgstAmount,
      ),
    ),

    totalCgst: number(
      firstDefined(
        source.totalCgst,

        source.cgst,

        source.cgstAmount,

        source.totalCgstAmount,
      ),
    ),

    totalSgst: number(
      firstDefined(
        source.totalSgst,

        source.sgst,

        source.sgstAmount,

        source.totalSgstAmount,
      ),
    ),

    totalCess: number(
      firstDefined(
        source.totalCess,

        source.cess,

        source.cessAmount,

        source.totalCessAmount,
      ),
    ),

    totalEligibleItc: number(
      firstDefined(source.totalEligibleItc, source.eligibleItc),
    ),

    totalUtilizedItc: number(
      firstDefined(source.totalUtilizedItc, source.utilizedItc),
    ),

    totalCashTaxPaid: number(
      firstDefined(
        source.totalCashTaxPaid,

        source.cashTaxPaid,

        source.cashTaxCollection,
      ),
    ),

    filingRate: nullableNumber(source.filingRate),

    filingRateMomGrowth: nullableNumber(source.filingRateMomGrowth),

    filedOnTime: nullableNumber(source.filedOnTime),

    filedLate: nullableNumber(source.filedLate),

    notFiled: nullableNumber(source.notFiled),
  };
};

const normalizeRow = (row) => ({
  ...row,

  retPeriod: row?.retPeriod ?? row?.period ?? "",

  stJuri: row?.stJuri ?? row?.officeCode ?? "",

  officeName: row?.officeName ?? row?.name ?? "",

  filedGstins: number(firstDefined(row?.filedGstins, row?.totalFiledGstins)),

  taxableValue: number(firstDefined(row?.taxableValue, row?.totalTaxableValue)),

  outputTax: number(firstDefined(row?.outputTax, row?.totalOutputTax)),

  igst: number(firstDefined(row?.igst, row?.totalIgst)),

  cgst: number(firstDefined(row?.cgst, row?.totalCgst)),

  sgst: number(firstDefined(row?.sgst, row?.totalSgst)),

  cess: number(firstDefined(row?.cess, row?.totalCess)),

  cashTaxPaid: number(firstDefined(row?.cashTaxPaid, row?.totalCashTaxPaid)),

  momOutputGrowth: nullableNumber(
    firstDefined(row?.momOutputGrowth, row?.momGrowth),
  ),

  yoyOutputGrowth: nullableNumber(
    firstDefined(row?.yoyOutputGrowth, row?.yoyGrowth),
  ),

  growthStatus: row?.growthStatus ?? row?.trend ?? "",
});

const growthClass = (value) => {
  const parsed = nullableNumber(value);

  if (parsed === null || parsed === 0) return "neutral";

  return parsed > 0 ? "positive" : "negative";
};

const statusClass = (status) => {
  switch (
    String(status || "")
      .trim()
      .toUpperCase()
  ) {
    case "HIGH":
      return "status-high";

    case "MEDIUM":
      return "status-medium";

    case "LOW":
      return "status-low";

    case "DECLINING":
      return "status-declining";

    case "NO_BASE":
      return "status-no-base";

    case "STABLE":
      return "status-stable";

    default:
      return "status-none";
  }
};

/* =========================================================

   SMALL COMPONENTS

\========================================================= */

const GrowthValue = ({ value }) => {
  const parsed = nullableNumber(value);

  if (parsed === null) {
    return <span className="growth-value neutral">—</span>;
  }

  return (
    <span className={`growth-value ${growthClass(parsed)}`}>
      {parsed > 0 && <ArrowUp size={12} strokeWidth={3} />}
      {parsed < 0 && <ArrowDown size={12} strokeWidth={3} />}
      {Math.abs(parsed).toFixed(2)}%
    </span>
  );
};

const KpiCard = ({
  title,

  value,

  fullValue,
  subtitle,

  growth,

  icon: Icon,

  tone = "kpi-blue",
}) => (
  <article className={`office-kpi-card ${tone}`}>
    <div className="office-kpi-content">
      <span className="office-kpi-title">{title}</span>

      <strong className="office-kpi-value" title={fullValue || String(value)}>
        {value}
      </strong>

      {fullValue && <span className="office-kpi-full-value">{fullValue}</span>}

      {growth !== undefined && growth !== null ? (
        <div className="office-kpi-growth">
          <GrowthValue value={growth} />

          <span>MoM</span>
        </div>
      ) : (
        <span className="office-kpi-subtitle">{subtitle}</span>
      )}
    </div>

    <div className="office-kpi-icon" aria-hidden="true">
      <Icon size={21} />
    </div>
  </article>
);

const ChartCard = ({ title, subtitle, children, className = "" }) => (
  <section className={`office-chart-card ${className}`}>
    <div className="office-card-heading">
      <div>
        <h3>{title}</h3>

        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>

    <div className="office-chart-content">{children}</div>
  </section>
);

const EmptyChart = ({ message = "No data available" }) => (
  <div className="office-empty-chart">
    <BarChart3 size={28} />

    <span>{message}</span>
  </div>
);

/* =========================================================

   MAIN COMPONENT

\========================================================= */

const OfficeRevenueDashboard = ({ onViewOffice }) => {
  const showActions = typeof onViewOffice === "function";

  const [periodOptions, setPeriodOptions] = useState([]);

  const [officeOptions, setOfficeOptions] = useState([]);

  const [selectedPeriod, setSelectedPeriod] = useState("");

  const [office, setOffice] = useState("");

  const [growthStatus, setGrowthStatus] = useState("");

  const [searchInput, setSearchInput] = useState("");

  const [search, setSearch] = useState("");

  const [page, setPage] = useState(0);

  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);

  const [reloadKey, setReloadKey] = useState(0);

  const [summary, setSummary] = useState(EMPTY_SUMMARY);

  const [rows, setRows] = useState([]);

  const [trend, setTrend] = useState([]);

  const [totalElements, setTotalElements] = useState(0);

  const [totalPages, setTotalPages] = useState(0);

  const [loadingPeriods, setLoadingPeriods] = useState(true);

  const [loading, setLoading] = useState(false);

  const [summaryLoading, setSummaryLoading] = useState(false);

  const [trendLoading, setTrendLoading] = useState(false);

  const [exporting, setExporting] = useState(false);

  const [errors, setErrors] = useState({});

  const [lastUpdated, setLastUpdated] = useState(null);

  const setError = useCallback((key, message) => {
    setErrors((previous) =>
      previous[key] === message ? previous : { ...previous, [key]: message },
    );
  }, []);

  const error = Object.values(errors).find(Boolean) || "";

  const busy = loading || summaryLoading || trendLoading;

  /* -------------------------------------------------------

     PERIODS

  ------------------------------------------------------- */

  useEffect(() => {
    const controller = new AbortController();

    setLoadingPeriods(true);

    setError("periods", "");

    fetchOfficeRevenuePeriods({ signal: controller.signal })
      .then((response) => {
        const options = normalizeOptions(response);

        setPeriodOptions(options);

        if (options.length > 0) {
          setSelectedPeriod((current) => current || options[0].value);
        }
      })

      .catch((err) => {
        if (isAbort(err)) return;

        console.error("Unable to load revenue periods", err);

        setError(
          "periods",

          apiMessage(err, "Unable to load GST return periods."),
        );
      })

      .finally(() => {
        if (!controller.signal.aborted) setLoadingPeriods(false);
      });

    return () => controller.abort();
  }, [setError]);

  /* -------------------------------------------------------

     OFFICES

  ------------------------------------------------------- */

  useEffect(() => {
    if (!selectedPeriod) {
      setOfficeOptions([]);

      return undefined;
    }

    const controller = new AbortController();

    fetchOfficeRevenueOffices({
      period: selectedPeriod,

      signal: controller.signal,
    })
      .then((response) => {
        setOfficeOptions(normalizeOptions(response));
      })

      .catch((err) => {
        if (isAbort(err)) return;

        console.error("Unable to load office options", err);

        setOfficeOptions([]);
      });

    return () => controller.abort();
  }, [selectedPeriod]);

  /* -------------------------------------------------------

     SUMMARY

  ------------------------------------------------------- */

  useEffect(() => {
    if (!selectedPeriod) return undefined;

    const controller = new AbortController();

    setSummaryLoading(true);

    setError("summary", "");

    fetchOfficeRevenueSummary({
      period: selectedPeriod,

      office: office || undefined,

      growthStatus: growthStatus || undefined,

      search: search || undefined,

      signal: controller.signal,
    })
      .then((response) => {
        setSummary(normalizeSummary(response));

        setLastUpdated(new Date());
      })

      .catch((err) => {
        if (isAbort(err)) return;

        console.error("Office revenue summary failed", err);

        setSummary(EMPTY_SUMMARY);

        setError(
          "summary",

          apiMessage(err, "Unable to load revenue summary."),
        );
      })

      .finally(() => {
        if (!controller.signal.aborted) setSummaryLoading(false);
      });

    return () => controller.abort();
  }, [selectedPeriod, office, growthStatus, search, reloadKey, setError]);

  /* -------------------------------------------------------

     TABLE

  ------------------------------------------------------- */

  useEffect(() => {
    if (!selectedPeriod) return undefined;

    const controller = new AbortController();

    setLoading(true);

    setError("list", "");

    fetchOfficeRevenueList({
      period: selectedPeriod,

      office: office || undefined,

      growthStatus: growthStatus || undefined,

      search: search || undefined,

      page,

      size,

      signal: controller.signal,
    })
      .then((response) => {
        const content =
          response?.content ??
          response?.items ??
          response?.data?.content ??
          response?.data?.items ??
          response?.data ??
          [];

        const list = Array.isArray(content) ? content.map(normalizeRow) : [];

        const total = number(
          response?.totalElements ??
            response?.totalRecords ??
            response?.data?.totalElements ??
            response?.data?.totalRecords ??
            list.length,
        );

        const pages = number(
          response?.totalPages ??
            response?.data?.totalPages ??
            (total > 0 ? Math.ceil(total / size) : 0),
        );

        setRows(list);

        setTotalElements(total);

        setTotalPages(pages);

        if (pages > 0 && page >= pages) {
          setPage(Math.max(0, pages - 1));
        }
      })

      .catch((err) => {
        if (isAbort(err)) return;

        console.error("Office revenue list failed", err);

        setRows([]);

        setTotalElements(0);

        setTotalPages(0);

        setError(
          "list",

          apiMessage(err, "Unable to load office revenue records."),
        );
      })

      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [
    selectedPeriod,

    office,

    growthStatus,

    search,

    page,

    size,

    reloadKey,

    setError,
  ]);

  /* -------------------------------------------------------

     TREND

  ------------------------------------------------------- */

  useEffect(() => {
    if (!selectedPeriod) return undefined;

    const controller = new AbortController();

    setTrendLoading(true);

    setError("trend", "");

    fetchOfficeRevenueTrend({
      period: selectedPeriod,

      office: office || undefined,

      months: TREND_MONTHS,

      signal: controller.signal,
    })
      .then((response) => {
        const list = Array.isArray(response)
          ? response
          : (response?.content ??
            response?.data?.content ??
            response?.data ??
            []);

        setTrend(Array.isArray(list) ? list : []);
      })

      .catch((err) => {
        if (isAbort(err)) return;

        console.error("Office revenue trend failed", err);

        setTrend([]);

        setError(
          "trend",

          apiMessage(err, "Unable to load monthly revenue trend."),
        );
      })

      .finally(() => {
        if (!controller.signal.aborted) setTrendLoading(false);
      });

    return () => controller.abort();
  }, [selectedPeriod, office, reloadKey, setError]);

  /* -------------------------------------------------------

     ACTIONS

  ------------------------------------------------------- */

  const handlePeriodChange = (event) => {
    setSelectedPeriod(event.target.value);

    setOffice("");

    setPage(0);
  };

  const handleSearch = () => {
    setSearch(searchInput.trim());

    setPage(0);
  };

  const handleSearchChange = (event) => {
    const value = event.target.value;

    setSearchInput(value);

    if (value === "" && search !== "") {
      setSearch("");

      setPage(0);
    }
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "Enter") handleSearch();
  };

  const handleReset = () => {
    setOffice("");

    setGrowthStatus("");

    setSearchInput("");

    setSearch("");

    setPage(0);

    setSize(DEFAULT_PAGE_SIZE);
  };

  const handleRefresh = () => {
    setReloadKey((current) => current + 1);
  };

  const handleExport = async () => {
    if (!selectedPeriod || exporting) return;

    setExporting(true);

    setError("export", "");

    try {
      await exportOfficeRevenue({
        period: selectedPeriod,

        office: office || undefined,

        search: search || undefined,

        growthStatus: growthStatus || undefined,
      });
    } catch (err) {
      console.error("Office revenue export failed", err);

      setError(
        "export",

        apiMessage(err, "Unable to export office revenue data."),
      );
    } finally {
      setExporting(false);
    }
  };

  /* -------------------------------------------------------

     TREND DERIVED DATA

  ------------------------------------------------------- */

  const trendSeries = useMemo(
    () =>
      trend

        .filter((item) => item && periodKey(item.retPeriod ?? item.period) > 0)

        .map((item) => ({
          retPeriod: item.retPeriod ?? item.period,

          outputTax: nullableNumber(
            firstDefined(item.outputTax, item.totalOutputTax),
          ),

          cashTaxPaid: nullableNumber(
            firstDefined(item.cashTaxPaid, item.totalCashTaxPaid),
          ),
        }))

        .sort((a, b) => periodKey(a.retPeriod) - periodKey(b.retPeriod)),

    [trend],
  );

  const trendByPeriod = useMemo(
    () => Object.fromEntries(trendSeries.map((item) => [item.retPeriod, item])),

    [trendSeries],
  );

  const trendData = useMemo(
    () =>
      trendSeries

        .map((item) => ({
          period: shortPeriodLabel(item.retPeriod),

          outputTax: nullableCrore(item.outputTax),

          cashTaxPaid: nullableCrore(item.cashTaxPaid),
        }))

        .slice(-TREND_DISPLAY),

    [trendSeries],
  );

  const previousMonth = trendByPeriod[shiftPeriod(selectedPeriod, -1)];

  const previousYear = trendByPeriod[shiftPeriod(selectedPeriod, -12)];

  const currentTrend = trendByPeriod[selectedPeriod];

  const kpiComparable = !growthStatus && !search;

  const outputGrowth = kpiComparable
    ? pctChange(summary.totalOutputTax, previousMonth?.outputTax)
    : null;

  const cashGrowth = kpiComparable
    ? pctChange(summary.totalCashTaxPaid, previousMonth?.cashTaxPaid)
    : null;

  const growthComparisonData = useMemo(() => {
    const currentOutput = nullableCrore(
      currentTrend?.outputTax ?? summary.totalOutputTax,
    );

    const currentCash = nullableCrore(
      currentTrend?.cashTaxPaid ?? summary.totalCashTaxPaid,
    );

    if (currentOutput === null && currentCash === null) return [];

    return [
      {
        name: "Output Tax",

        current: currentOutput,

        previousMonth: nullableCrore(previousMonth?.outputTax),

        previousYear: nullableCrore(previousYear?.outputTax),
      },

      {
        name: "Cash Tax",

        current: currentCash,

        previousMonth: nullableCrore(previousMonth?.cashTaxPaid),

        previousYear: nullableCrore(previousYear?.cashTaxPaid),
      },
    ];
  }, [
    currentTrend,

    previousMonth,

    previousYear,

    summary.totalOutputTax,

    summary.totalCashTaxPaid,
  ]);

  /* -------------------------------------------------------

     TAX BREAKDOWN

  ------------------------------------------------------- */

  const taxBreakdown = useMemo(() => {
    const components = [
      {
        name: "IGST",

        rawValue: number(summary.totalIgst),

        color: TAX_COLORS.IGST,
      },

      {
        name: "CGST",

        rawValue: number(summary.totalCgst),

        color: TAX_COLORS.CGST,
      },

      {
        name: "SGST",

        rawValue: number(summary.totalSgst),

        color: TAX_COLORS.SGST,
      },

      {
        name: "CESS",

        rawValue: number(summary.totalCess),

        color: TAX_COLORS.CESS,
      },
    ];

    return components

      .filter((item) => item.rawValue > 0)

      .map((item) => ({
        ...item,

        value: toCrore(item.rawValue),
      }));
  }, [
    summary.totalIgst,

    summary.totalCgst,

    summary.totalSgst,

    summary.totalCess,
  ]);

  const totalTaxBreakdown = useMemo(
    () =>
      taxBreakdown.reduce(
        (sum, item) => sum + item.value,

        0,
      ),

    [taxBreakdown],
  );

  /* -------------------------------------------------------

     CURRENT PAGE CHARTS

  ------------------------------------------------------- */

  const topRevenue = useMemo(
    () =>
      [...rows]

        .sort((a, b) => number(b.outputTax) - number(a.outputTax))

        .slice(0, 5)

        .map((item) => ({
          name: item.officeName || item.stJuri || "Office",

          value: toCrore(item.outputTax),
        })),

    [rows],
  );

  const topGrowth = useMemo(
    () =>
      [...rows]

        .filter((item) => nullableNumber(item.momOutputGrowth) !== null)

        .sort((a, b) => number(b.momOutputGrowth) - number(a.momOutputGrowth))

        .slice(0, 5)

        .map((item) => ({
          name: item.officeName || item.stJuri || "Office",

          value: number(item.momOutputGrowth),
        })),

    [rows],
  );

  const filingStatus = useMemo(() => {
    const onTime = nullableNumber(summary.filedOnTime);

    const late = nullableNumber(summary.filedLate);

    const notFiled = nullableNumber(summary.notFiled);

    if (onTime === null && late === null && notFiled === null) return [];

    return [
      {
        name: "Filed On Time",

        value: number(onTime),

        color: "#16a34a",
      },

      {
        name: "Filed Late",

        value: number(late),

        color: "#f59e0b",
      },

      {
        name: "Not Filed",

        value: number(notFiled),

        color: "#dc2626",
      },
    ].filter((item) => item.value > 0);
  }, [summary.filedOnTime, summary.filedLate, summary.notFiled]);

  const filingTotal = useMemo(
    () =>
      filingStatus.reduce(
        (sum, item) => sum + item.value,

        0,
      ),

    [filingStatus],
  );

  /* -------------------------------------------------------

     PAGINATION

  ------------------------------------------------------- */

  const canPrevious = page > 0;

  const canNext = page + 1 < totalPages;

  const columnCount = showActions ? 15 : 14;

  const firstRecord = totalElements === 0 ? 0 : page * size + 1;

  const lastRecord = Math.min(
    (page + 1) * size,

    totalElements,
  );

  return (
    <div className="office-revenue-dashboard">
      {/* FILTERS */}

      <section className="office-filter-panel">
        <div className="office-filter-topline">
          <div className="office-filter-title">
            <div className="office-filter-title-icon">
              <BarChart3 size={18} />
            </div>

            <div>
              <h2>Revenue Analysis</h2>

              <p>
                GSTR-3B office-wise revenue collection and growth monitoring
              </p>
            </div>
          </div>

          <div className="office-filter-meta">
            <div className="office-last-updated">
              <CalendarDays size={14} />

              <span>
                Last updated:
                <strong>
                  {lastUpdated
                    ? ` ${lastUpdated.toLocaleDateString(
                        "en-IN",
                      )} ${lastUpdated.toLocaleTimeString("en-IN", {
                        hour: "2-digit",

                        minute: "2-digit",
                      })}`
                    : " —"}
                </strong>
              </span>
            </div>

            <button
              type="button"
              className="office-btn office-btn-refresh"
              onClick={handleRefresh}
              disabled={busy || !selectedPeriod}
            >
              <RefreshCw size={15} className={busy ? "spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        <div className="office-filter-grid">
          <div className="office-filter-field">
            <label htmlFor="revenue-period">
              Return Period <span>*</span>
            </label>

            <select
              id="revenue-period"
              value={selectedPeriod}
              disabled={loadingPeriods}
              onChange={handlePeriodChange}
            >
              {loadingPeriods && <option value="">Loading periods...</option>}

              {!loadingPeriods && periodOptions.length === 0 && (
                <option value="">No return period</option>
              )}

              {periodOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="office-filter-field">
            <label htmlFor="revenue-office">Office / Jurisdiction</label>

            <select
              id="revenue-office"
              value={office}
              onChange={(event) => {
                setOffice(event.target.value);

                setPage(0);
              }}
            >
              <option value="">All Offices</option>
              {officeOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="office-filter-field">
            <label htmlFor="growth-status">Growth Status</label>

            <select
              id="growth-status"
              value={growthStatus}
              onChange={(event) => {
                setGrowthStatus(event.target.value);

                setPage(0);
              }}
            >
              <option value="">All Growth Status</option>

              {GROWTH_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="office-filter-field">
            <label htmlFor="office-search">Search Office</label>

            <div className="office-search-input">
              <Search size={16} />

              <input
                id="office-search"
                type="text"
                value={searchInput}
                maxLength={100}
                placeholder="Office code or office name"
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
          </div>

          <div className="office-filter-actions">
            <button
              type="button"
              className="office-btn office-btn-search"
              onClick={handleSearch}
              disabled={!selectedPeriod}
            >
              <Search size={15} />
              Search
            </button>

            <button
              type="button"
              className="office-btn office-btn-reset"
              onClick={handleReset}
            >
              <RotateCcw size={15} />
              Reset
            </button>

            <button
              type="button"
              className="office-btn office-btn-export"
              onClick={handleExport}
              disabled={!selectedPeriod || exporting}
            >
              {exporting ? (
                <Loader2 size={15} className="spin" />
              ) : (
                <Download size={15} />
              )}
              Export CSV
            </button>
          </div>
        </div>
      </section>

      {/* ERROR */}

      {error && (
        <div className="office-dashboard-alert" role="alert">
          <AlertCircle size={18} />

          <span>{error}</span>

          <button type="button" onClick={handleRefresh}>
            Retry
          </button>
        </div>
      )}

      {/* KPI */}

      <section className="office-kpi-grid" aria-busy={summaryLoading}>
        {/* <KpiCard

          title="Total Offices"

          value={formatInteger(summary.totalOffices)}

          subtitle="Reporting offices"

          icon={Building2}

          tone="kpi-blue"

        /> */}

        <KpiCard
          title="Taxable Value"
          value={formatCrore(summary.totalTaxableValue)}
          fullValue={formatFullRupees(summary.totalTaxableValue)}
          subtitle="Selected return period"
          icon={FileText}
          tone="kpi-red"
        />

        <KpiCard
          title="Output Tax"
          value={formatCrore(summary.totalOutputTax)}
          fullValue={formatFullRupees(summary.totalOutputTax)}
          subtitle="Selected return period"
          growth={outputGrowth}
          icon={Coins}
          tone="kpi-orange"
        />

        <KpiCard
          title="Cash Tax Collection"
          value={formatCrore(summary.totalCashTaxPaid)}
          fullValue={formatFullRupees(summary.totalCashTaxPaid)}
          subtitle="Selected return period"
          growth={cashGrowth}
          icon={IndianRupee}
          tone="kpi-green"
        />

        <KpiCard
          title="ITC Utilized"
          value={formatCrore(summary.totalUtilizedItc)}
          fullValue={formatFullRupees(summary.totalUtilizedItc)}
          subtitle="Selected return period"
          icon={WalletCards}
          tone="kpi-purple"
        />

        <KpiCard
          title="Filing Rate"
          value={formatPercent(summary.filingRate)}
          subtitle={`${formatInteger(summary.totalFiledGstins)} filed GSTINs`}
          growth={summary.filingRateMomGrowth}
          icon={CheckCircle2}
          tone="kpi-rose"
        />
      </section>

      {/* MAIN CHARTS */}

      <section className="office-chart-grid office-chart-grid-main">
        <ChartCard
          title="Monthly Revenue Trend"
          subtitle="Output Tax vs Cash Tax Collection · ₹ Crore"
          className="monthly-revenue-chart-card"
        >
          {trendData.length === 0 ? (
            <EmptyChart
              message={
                trendLoading
                  ? "Loading monthly revenue..."
                  : "No monthly revenue data available"
              }
            />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={trendData}
                margin={{
                  top: 12,

                  right: 18,

                  left: 5,

                  bottom: 5,
                }}
              >
                <CartesianGrid
                  strokeDasharray="4 4"
                  vertical={false}
                  stroke="#e5eaf0"
                />

                <XAxis
                  dataKey="period"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 11,

                    fill: "#52657a",
                  }}
                  dy={8}
                />

                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={55}
                  tick={{
                    fontSize: 10,

                    fill: "#52657a",
                  }}
                  tickFormatter={compactCrore}
                />

                <Tooltip
                  cursor={{
                    stroke: "#cbd5e1",

                    strokeWidth: 1,

                    strokeDasharray: "4 4",
                  }}
                  formatter={(value, name) => [formatCroreChart(value), name]}
                  contentStyle={{
                    border: "1px solid #d8e2ec",

                    borderRadius: "7px",

                    boxShadow: "0 8px 24px rgba(15, 39, 66, 0.10)",

                    fontSize: "11px",
                  }}
                />

                <Legend
                  verticalAlign="top"
                  align="right"
                  height={36}
                  iconType="circle"
                  wrapperStyle={{ fontSize: "11px" }}
                />

                <Line
                  type="monotone"
                  dataKey="outputTax"
                  name="Output Tax"
                  stroke="#2563eb"
                  strokeWidth={3}
                  dot={{
                    r: 3.5,

                    fill: "#ffffff",

                    stroke: "#2563eb",

                    strokeWidth: 2,
                  }}
                  activeDot={{ r: 6 }}
                  connectNulls={false}
                />

                <Line
                  type="monotone"
                  dataKey="cashTaxPaid"
                  name="Cash Tax Collection"
                  stroke="#16a34a"
                  strokeWidth={3}
                  dot={{
                    r: 3.5,

                    fill: "#ffffff",

                    stroke: "#16a34a",

                    strokeWidth: 2,
                  }}
                  activeDot={{ r: 6 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Tax Component Breakdown"
          subtitle={`${periodLabel(selectedPeriod)} · ₹ Crore`}
        >
          {summaryLoading ? (
            <div className="office-empty-chart">
              <Loader2 size={26} className="spin" />

              <span>Loading tax components...</span>
            </div>
          ) : taxBreakdown.length === 0 ? (
            <div className="office-tax-no-data">
              <Coins size={28} />

              <strong>Tax component data unavailable</strong>

              <span>
                IGST, CGST, SGST and CESS values were not returned for this
                period.
              </span>
            </div>
          ) : (
            <div className="office-tax-breakdown-layout">
              <div className="office-tax-donut">
                <ResponsiveContainer width="100%" height={245}>
                  <PieChart>
                    <Pie
                      data={taxBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={63}
                      outerRadius={92}
                      paddingAngle={2}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {taxBreakdown.map((item) => (
                        <Cell key={item.name} fill={item.color} />
                      ))}
                    </Pie>

                    <Tooltip
                      formatter={(value, name, item) => {
                        const rawValue =
                          item?.payload?.rawValue ?? value * INR_CRORE;
                        return [
                          `${formatFullRupees(rawValue)} (${formatCroreChart(value)})`,
                          name,
                        ];
                      }}
                      contentStyle={{
                        border: "1px solid #d6e0e9",

                        borderRadius: "6px",

                        fontSize: "12px",

                        boxShadow: "0 5px 18px rgba(15, 39, 66, 0.12)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="office-tax-donut-center">
                  <span className="office-tax-center-label">
                    Total Output Tax
                  </span>
                  <strong>{formatCroreChart(totalTaxBreakdown)}</strong>
                  <span
                    className="office-tax-center-full"
                    title={formatFullRupees(totalTaxBreakdown * INR_CRORE)}
                  >
                    {formatFullRupees(totalTaxBreakdown * INR_CRORE)}
                  </span>
                </div>
              </div>

              <div className="office-tax-legend">
                {taxBreakdown.map((item) => {
                  const percentage =
                    totalTaxBreakdown > 0
                      ? (item.value / totalTaxBreakdown) * 100
                      : 0;

                  return (
                    <div className="office-tax-legend-item" key={item.name}>
                      <span
                        className="office-tax-legend-color"
                        style={{
                          backgroundColor: item.color,
                        }}
                      />

                      <div className="office-tax-legend-name">{item.name}</div>

                      <div className="office-tax-legend-value">
                        <strong title={formatFullRupees(item.rawValue)}>
                          {formatFullRupees(item.rawValue)}
                        </strong>
                        <span>
                          {formatCroreChart(item.value)} ·{" "}
                          {percentage.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Revenue Comparison"
          subtitle="Current vs previous periods · ₹ Crore"
        >
          {growthComparisonData.length === 0 ? (
            <EmptyChart
              message={
                trendLoading
                  ? "Loading comparison..."
                  : "No comparison data available"
              }
            />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={growthComparisonData}
                margin={{
                  top: 18,

                  right: 10,

                  left: 2,

                  bottom: 5,
                }}
              >
                <CartesianGrid
                  strokeDasharray="4 4"
                  vertical={false}
                  stroke="#e5eaf0"
                />

                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 10,

                    fill: "#52657a",
                  }}
                />

                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 10,

                    fill: "#52657a",
                  }}
                  tickFormatter={compactCrore}
                />

                <Tooltip
                  formatter={(value, name) => [formatCroreChart(value), name]}
                />

                <Legend wrapperStyle={{ fontSize: "10px" }} />

                <Bar
                  dataKey="current"
                  name="Current"
                  fill="#2563eb"
                  radius={[4, 4, 0, 0]}
                />

                <Bar
                  dataKey="previousMonth"
                  name="Previous Month"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                />

                <Bar
                  dataKey="previousYear"
                  name="Previous Year"
                  fill="#16a34a"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </section>

      {/* SECONDARY CHARTS */}

      <section className="office-chart-grid office-chart-grid-secondary">
        <ChartCard
          title="Top 5 Offices by Revenue"
          subtitle="Current page · Output Tax · ₹ Crore"
        >
          {topRevenue.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={245}>
              <BarChart
                data={topRevenue}
                layout="vertical"
                margin={{
                  top: 8,

                  right: 28,

                  left: 60,

                  bottom: 5,
                }}
              >
                <CartesianGrid
                  strokeDasharray="4 4"
                  horizontal={false}
                  stroke="#e5eaf0"
                />

                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 10,

                    fill: "#52657a",
                  }}
                  tickFormatter={compactCrore}
                />

                <YAxis
                  type="category"
                  dataKey="name"
                  width={115}
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 10,

                    fill: "#334155",
                  }}
                />

                <Tooltip formatter={(value) => formatCroreChart(value)} />

                <Bar
                  dataKey="value"
                  name="Output Tax"
                  fill="#2563eb"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Top 5 Offices by Growth"
          subtitle="Current page · MoM Output Tax Growth"
        >
          {topGrowth.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={245}>
              <BarChart
                data={topGrowth}
                layout="vertical"
                margin={{
                  top: 8,

                  right: 28,

                  left: 60,

                  bottom: 5,
                }}
              >
                <CartesianGrid
                  strokeDasharray="4 4"
                  horizontal={false}
                  stroke="#e5eaf0"
                />

                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 10,

                    fill: "#52657a",
                  }}
                  tickFormatter={(value) => `${value}%`}
                />

                <YAxis
                  type="category"
                  dataKey="name"
                  width={115}
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 10,

                    fill: "#334155",
                  }}
                />

                <Tooltip
                  formatter={(value) => `${number(value).toFixed(2)}%`}
                />

                <Bar
                  dataKey="value"
                  name="MoM Growth"
                  fill="#16a34a"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Filing Status" subtitle={periodLabel(selectedPeriod)}>
          {filingStatus.length === 0 ? (
            <EmptyChart message="No filing-status data available" />
          ) : (
            <div className="office-donut-layout filing-donut-layout">
              <div className="office-donut-chart">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={filingStatus}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={82}
                      paddingAngle={2}
                    >
                      {filingStatus.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>

                    <Tooltip formatter={(value) => formatInteger(value)} />
                  </PieChart>
                </ResponsiveContainer>

                <div className="office-donut-center">
                  <strong>{formatInteger(filingTotal)}</strong>

                  <span>Total GSTINs</span>
                </div>
              </div>

              <div className="office-chart-legend">
                {filingStatus.map((item) => (
                  <div
                    key={item.name}
                    className="office-legend-row filing-legend-row"
                  >
                    <i
                      style={{
                        background: item.color,
                      }}
                    />

                    <span>{item.name}</span>

                    <strong>
                      {formatInteger(item.value)}

                      {filingTotal > 0 &&
                        ` (${((item.value / filingTotal) * 100).toFixed(1)}%)`}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>
      </section>

      {/* TABLE */}

      <section className="office-revenue-table-card" aria-busy={loading}>
        <div className="office-table-toolbar">
          <div>
            <h3>Office-wise Revenue Collection</h3>

            <p>Office records for {periodLabel(selectedPeriod)}</p>
          </div>

          <div className="office-table-controls">
            <label htmlFor="revenue-page-size">Show</label>

            <select
              id="revenue-page-size"
              value={size}
              onChange={(event) => {
                setSize(Number(event.target.value));

                setPage(0);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <span>entries</span>
          </div>
        </div>

        <div className="office-table-scroll">
          <table className="office-revenue-table">
            <thead>
              <tr>
                <th rowSpan={2}>#</th>
                <th rowSpan={2} className="text-left">
                  Office Name
                </th>
                <th rowSpan={2}>Filed GSTINs</th>
                <th rowSpan={2}>
                  Taxable Value
                  <small>₹ Crore</small>
                </th>
                <th colSpan={5}>Output Tax (₹ Crore)</th>
                <th rowSpan={2}>
                  Cash Tax<small>₹ Crore</small>
                </th>
                <th rowSpan={2}>
                  MoM
                  <small>Growth %</small>
                </th>
                <th rowSpan={2}>
                  YoY
                  <small>Growth %</small>
                </th>
                <th rowSpan={2}>Growth Status</th>

                {showActions && <th rowSpan={2}>Action</th>}
              </tr>

              <tr>
                <th>Total</th>

                <th>IGST</th>

                <th>CGST</th>

                <th>SGST</th>

                <th>CESS</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columnCount}>
                    <div className="office-table-state">
                      <Loader2 size={23} className="spin" />
                      Loading office revenue data...
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columnCount}>
                    <div className="office-table-state">
                      <FileText size={24} />
                      No office revenue records found.
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr
                    key={`${row.retPeriod || selectedPeriod}-${
                      row.stJuri || "office"
                    }-${index}`}
                  >
                    <td className="text-center">{page * size + index + 1}</td>
                    <td
                      className="text-left office-name"
                      title={row.officeName || ""}
                    >
                      {row.officeName || "—"}
                    </td>

                    <td className="text-center filed-gstin-cell">
                      {formatInteger(row.filedGstins)}
                    </td>

                    <td className="money-cell">
                      {formatCroreValue(row.taxableValue)}
                    </td>
                    <td className="money-cell output-tax">
                      {formatCroreValue(row.outputTax)}
                    </td>
                    <td className="money-cell">{formatCroreValue(row.igst)}</td>

                    <td className="money-cell">{formatCroreValue(row.cgst)}</td>
                    <td className="money-cell">{formatCroreValue(row.sgst)}</td>
                    <td className="money-cell">{formatCroreValue(row.cess)}</td>
                    <td className="money-cell cash-tax">
                      {formatCroreValue(row.cashTaxPaid)}
                    </td>
                    <td className="text-center">
                      <GrowthValue value={row.momOutputGrowth} />
                    </td>
                    <td className="text-center">
                      <GrowthValue value={row.yoyOutputGrowth} />
                    </td>
                    <td className="text-center">
                      <span
                        className={`office-status-badge ${statusClass(
                          row.growthStatus,
                        )}`}
                      >
                        {row.growthStatus || "—"}
                      </span>
                    </td>

                    {showActions && (
                      <td className="text-center">
                        <button
                          type="button"
                          className="office-view-btn"
                          title={`View ${
                            row.officeName || row.stJuri || "office"
                          }`}
                          onClick={() => onViewOffice(row)}
                        >
                          <Eye size={14} />
                          View
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="office-pagination-bar">
          <div className="office-pagination-info">
            Showing <strong>{firstRecord}</strong> to{" "}
            <strong>{lastRecord}</strong> of{" "}
            <strong>{formatInteger(totalElements)}</strong> records
          </div>

          <div className="office-pagination">
            <button
              type="button"
              disabled={!canPrevious || loading}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft size={17} />
            </button>

            <span>
              Page <strong>{totalPages === 0 ? 0 : page + 1}</strong> of{" "}
              <strong>{totalPages}</strong>
            </span>

            <button
              type="button"
              disabled={!canNext || loading}
              onClick={() => setPage((current) => current + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default OfficeRevenueDashboard;
