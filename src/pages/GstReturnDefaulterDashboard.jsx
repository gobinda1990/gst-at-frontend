import React, {

  useCallback,

  useEffect,

  useMemo,

  useState,

} from "react";



import {

  AlertTriangle,

  Bell,

  CheckCircle2,

  ChevronLeft,

  ChevronRight,

  Clock3,

  Download,

  Eye,

  FileWarning,

  Gavel,

  Loader2,

  RefreshCw,

  RotateCcw,

  Search,

  UserRoundX,

  Users,

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



const toNumber = (value) => {

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;

};



const safeCount = (value) => Math.max(0, toNumber(value));



const integer = (value) =>

  new Intl.NumberFormat("en-IN", {

    maximumFractionDigits: 0,

  }).format(toNumber(value));



const money = (value) =>

  new Intl.NumberFormat("en-IN", {

    style: "currency",

    currency: "INR",

    maximumFractionDigits: 0,

  }).format(toNumber(value));



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



const formatDate = (value) => {

  if (!value) return "—";

  const text = String(value);

  if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(text)) return text;



  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return text;



  return new Intl.DateTimeFormat("en-IN", {

    day: "2-digit",

    month: "2-digit",

    year: "numeric",

  }).format(date);

};



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

  const [riskLevel, setRiskLevel] = useState("");

  const [defaultLevel, setDefaultLevel] = useState("");

  const [gstr3aEligible, setGstr3aEligible] = useState("");

  const [searchText, setSearchText] = useState("");

  const [search, setSearch] = useState("");



  const [page, setPage] = useState(0);

  const [size, setSize] = useState(25);



  const [summary, setSummary] = useState(null);

  const [data, setData] = useState(EMPTY_PAGE);



  const [loading, setLoading] = useState(false);

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



  useEffect(() => {

    if (!period) {

      setOffices([]);

      setOffice("");

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



  const requestParams = useMemo(

    () => ({

      retPeriod: period,

      office,

      filingStatus,

      riskLevel,

      defaultLevel,

      gstr3aEligible,

      search,

      page,

      size,

    }),

    [

      period,

      office,

      filingStatus,

      riskLevel,

      defaultLevel,

      gstr3aEligible,

      search,

      page,

      size,

    ],

  );



  useEffect(() => {

    if (!period) return undefined;



    const controller = new AbortController();



    const load = async () => {

      setLoading(true);

      setError("");



      try {

        const [summaryResponse, pageResponse] = await Promise.all([

          fetchDefaulterSummary(requestParams, {

            signal: controller.signal,

          }),

          fetchDefaulters(requestParams, {

            signal: controller.signal,

          }),

        ]);



        if (controller.signal.aborted) return;



        setSummary(summaryResponse?.data ?? summaryResponse ?? null);

        setData(normalizePage(pageResponse));

        setLastUpdated(new Date());

      } catch (err) {

        if (!isAbortError(err)) {

          setError(apiError(err, "Unable to load defaulter dashboard."));

        }

      } finally {

        if (!controller.signal.aborted) setLoading(false);

      }

    };



    load();

    return () => controller.abort();

  }, [requestParams, refreshKey]);



  const changeFilter = (setter) => (event) => {

    setter(event.target.value);

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

    setRiskLevel("");

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

      const blob = await exportDefaultersCsv({

        ...requestParams,

        page: undefined,

        size: undefined,

      });



      const url = URL.createObjectURL(blob);

      const anchor = document.createElement("a");

      anchor.href = url;

      anchor.download = `gst-3b-defaulters-${period}.csv`;

      document.body.appendChild(anchor);

      anchor.click();

      anchor.remove();

      URL.revokeObjectURL(url);

    } catch (err) {

      setError(apiError(err, "CSV export failed."));

    } finally {

      setExporting(false);

    }

  }, [period, exporting, requestParams]);



  const records = Array.isArray(data.content) ? data.content : [];



  const countRowsBy = useCallback(

    (field, values) => {

      const result = Object.fromEntries(values.map((value) => [value, 0]));



      records.forEach((row) => {

        const value = normalizeLevel(row?.[field]);

        if (Object.prototype.hasOwnProperty.call(result, value)) {

          result[value] += 1;

        }

      });



      return result;

    },

    [records],

  );



  const totalRecords = safeCount(summary?.total ?? data.totalElements);

  const notFiled = safeCount(summary?.notFiled);

  const filedLate = safeCount(summary?.filedLate);

  const filedOnTime =

    summary?.filedOnTime != null

      ? safeCount(summary.filedOnTime)

      : Math.max(0, totalRecords - notFiled - filedLate);



  const filingRows = useMemo(

    () =>

      countRowsBy("filingStatus", [

        "NOT_FILED",

        "FILED_LATE",

        "FILED_ON_TIME",

      ]),

    [countRowsBy],

  );



  const filingChartData = useMemo(() => {

    const hasSummary =

      totalRecords > 0 || notFiled > 0 || filedLate > 0 || filedOnTime > 0;



    return [

      {

        name: "Not Filed",

        value: hasSummary ? notFiled : filingRows.NOT_FILED,

        color: CHART_COLORS.red,

      },

      {

        name: "Filed Late",

        value: hasSummary ? filedLate : filingRows.FILED_LATE,

        color: CHART_COLORS.amber,

      },

      {

        name: "Filed On Time",

        value: hasSummary ? filedOnTime : filingRows.FILED_ON_TIME,

        color: CHART_COLORS.green,

      },

    ];

  }, [totalRecords, notFiled, filedLate, filedOnTime, filingRows]);



  const defaultRows = useMemo(

    () => countRowsBy("defaultLevel", ["NORMAL", "WARNING", "HIGH", "CRITICAL"]),

    [countRowsBy],

  );



  const defaultChartData = useMemo(() => {

    const server = {

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

    };



    const source = Object.values(server).some((value) => value > 0)

      ? server

      : defaultRows;



    return [

      { name: "Normal", value: source.NORMAL, color: CHART_COLORS.green },

      { name: "Warning", value: source.WARNING, color: CHART_COLORS.amber },

      { name: "High", value: source.HIGH, color: CHART_COLORS.orange },

      { name: "Critical", value: source.CRITICAL, color: CHART_COLORS.red },

    ];

  }, [summary, defaultRows]);



  const riskRows = useMemo(

    () =>

      countRowsBy("riskLevel", [

        "LOW",

        "MEDIUM",

        "HIGH",

        "VERY_HIGH",

        "CRITICAL",

      ]),

    [countRowsBy],

  );



  const riskChartData = useMemo(() => {

    const server = {

      LOW: safeCount(summary?.lowRisk ?? summary?.riskLow),

      MEDIUM: safeCount(summary?.mediumRisk ?? summary?.riskMedium),

      HIGH: safeCount(summary?.highRisk ?? summary?.riskHigh),

      VERY_HIGH: safeCount(summary?.veryHighRisk ?? summary?.riskVeryHigh),

      CRITICAL: safeCount(summary?.criticalRisk ?? summary?.riskCritical),

    };



    const source = Object.values(server).some((value) => value > 0)

      ? server

      : riskRows;



    return [

      { name: "Low", value: source.LOW, color: CHART_COLORS.green },

      { name: "Medium", value: source.MEDIUM, color: CHART_COLORS.amber },

      { name: "High", value: source.HIGH, color: CHART_COLORS.orange },

      {

        name: "Very High",

        value: source.VERY_HIGH + source.CRITICAL,

        color: CHART_COLORS.red,

      },

    ];

  }, [summary, riskRows]);



  const filingTotal = filingChartData.reduce(

    (sum, item) => sum + safeCount(item.value),

    0,

  );

  const defaultTotal = defaultChartData.reduce(

    (sum, item) => sum + safeCount(item.value),

    0,

  );

  const riskTotal = riskChartData.reduce(

    (sum, item) => sum + safeCount(item.value),

    0,

  );



  const totalPages = toNumber(data.totalPages);

  const totalElements = toNumber(data.totalElements);

  const firstRecord = totalElements ? page * size + 1 : 0;

  const lastRecord = Math.min((page + 1) * size, totalElements);



  return (

    <>
      <main className="def-dashboard">

      <header className="def-titlebar">

        <div>

          <h1>Return 3B Defaulter Dashboard</h1>

          <p>

            Dashboard <span>›</span> GST Return 3B Defaulters

          </p>

        </div>



        <div className="def-title-actions">

          <div className="def-last-updated">

            Last Updated:

            <strong>

              {lastUpdated

                ? ` ${lastUpdated.toLocaleString("en-IN", {

                    day: "2-digit",

                    month: "short",

                    year: "numeric",

                    hour: "2-digit",

                    minute: "2-digit",

                  })}`

                : " —"}

            </strong>

          </div>



          <button

            type="button"

            className="def-refresh-btn"

            onClick={() => setRefreshKey((value) => value + 1)}

            disabled={loading || !period}

          >

            <RefreshCw size={15} className={loading ? "def-spin" : ""} />

            Refresh

          </button>

        </div>

      </header>



      <section className="def-filter-panel">

        <div className="def-filter-grid">

          <FilterField id="def-period" label="Return Period" required>

            <select

              id="def-period"

              value={period}

              onChange={changeFilter(setPeriod)}

            >

              <option value="">Select Period</option>

              {periods.map((item) => (

                <option key={item.value} value={item.value}>

                  {item.label}

                </option>

              ))}

            </select>

          </FilterField>



          <FilterField id="def-office" label="Office">

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

          </FilterField>



          <FilterField id="def-filing" label="Filing Status">

            <select

              id="def-filing"

              value={filingStatus}

              onChange={changeFilter(setFilingStatus)}

            >

              <option value="">All</option>

              <option value="NOT_FILED">Not Filed</option>

              <option value="FILED_LATE">Filed Late</option>

              <option value="FILED_ON_TIME">Filed On Time</option>

              <option value="NOT_DUE">Not Due</option>

            </select>

          </FilterField>



          <FilterField id="def-default" label="Default Level">

            <select

              id="def-default"

              value={defaultLevel}

              onChange={changeFilter(setDefaultLevel)}

            >

              <option value="">All</option>

              <option value="CRITICAL">Critical</option>

              <option value="HIGH">High</option>

              <option value="WARNING">Warning</option>

              <option value="NORMAL">Normal</option>

            </select>

          </FilterField>



          <FilterField id="def-risk" label="Risk Level">

            <select

              id="def-risk"

              value={riskLevel}

              onChange={changeFilter(setRiskLevel)}

            >

              <option value="">All</option>

              <option value="HIGH">High</option>

              <option value="MEDIUM">Medium</option>

              <option value="LOW">Low</option>

            </select>

          </FilterField>



          <FilterField id="def-gstr3a" label="GSTR-3A Eligible">

            <select

              id="def-gstr3a"

              value={gstr3aEligible}

              onChange={changeFilter(setGstr3aEligible)}

            >

              <option value="">All</option>

              <option value="Y">Eligible</option>

              <option value="N">Not Eligible</option>

            </select>

          </FilterField>

        </div>



        <form className="def-search-row" onSubmit={submitSearch}>

          <div className="def-search-field">

            <label htmlFor="def-search">GSTIN / Taxpayer / Office</label>

            <div className="def-search-input">

              <Search size={15} />

              <input

                id="def-search"

                value={searchText}

                maxLength={100}

                placeholder="Enter GSTIN, taxpayer name or office"

                onChange={(event) => setSearchText(event.target.value)}

              />

            </div>

          </div>



          <div className="def-filter-actions">

            <button type="submit" className="def-btn def-btn-search">

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

              {exporting ? "Exporting" : "Export"}

            </button>

          </div>

        </form>

      </section>



      {error && (

        <div className="def-error">

          <AlertTriangle size={18} />

          {error}

        </div>

      )}



      <section className="def-kpis">

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

        <KpiCard

          title="Section 62 Candidates"

          value={summary?.section62Candidates}

          subtitle="Assessment candidates"

          icon={Gavel}

          tone="rose"

        />

      </section>    &#x20;



      <section className="def-chart-grid">

        <article className="def-chart-card">

          <div className="def-chart-header">

            <h3>Filing Status Distribution</h3>

          </div>

          {filingTotal > 0 ? (

            <div className="def-chart-body def-pie-layout">

              <div className="def-pie-container">

                <ResponsiveContainer width="100%" height="100%">

                  <PieChart>

                    <Pie

                      data={filingChartData}

                      dataKey="value"

                      innerRadius={45}

                      outerRadius={70}

                      paddingAngle={1}

                      stroke="#fff"

                      strokeWidth={2}

                      isAnimationActive={false}

                    >

                      {filingChartData.map((item) => (

                        <Cell key={item.name} fill={item.color} />

                      ))}

                    </Pie>

                    <Tooltip

                      formatter={(value, name) => [

                        `${integer(value)} (${percentage(value, filingTotal)})`,

                        name,

                      ]}

                    />

                  </PieChart>

                </ResponsiveContainer>

              </div>

              <ChartLegend data={filingChartData} total={filingTotal} />

            </div>

          ) : (

            <div className="def-chart-empty">No filing status data.</div>

          )}

        </article>



        <article className="def-chart-card">

          <div className="def-chart-header">

            <h3>Default Level Distribution</h3>

          </div>

          {defaultTotal > 0 ? (

            <div className="def-chart-body">

              <ResponsiveContainer width="100%" height="100%">

                <BarChart data={defaultChartData}>

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

                  <Tooltip formatter={(value) => [integer(value), "GSTINs"]} />

                  <Bar

                    dataKey="value"

                    radius={[4, 4, 0, 0]}

                    maxBarSize={52}

                    isAnimationActive={false}

                  >

                    {defaultChartData.map((item) => (

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



        <article className="def-chart-card">

          <div className="def-chart-header">

            <h3>Risk Level Distribution</h3>

          </div>

          {riskTotal > 0 ? (

            <div className="def-chart-body def-pie-layout">

              <div className="def-pie-container">

                <ResponsiveContainer width="100%" height="100%">

                  <PieChart>

                    <Pie

                      data={riskChartData}

                      dataKey="value"

                      innerRadius={45}

                      outerRadius={70}

                      paddingAngle={1}

                      stroke="#fff"

                      strokeWidth={2}

                      isAnimationActive={false}

                    >

                      {riskChartData.map((item) => (

                        <Cell key={item.name} fill={item.color} />

                      ))}

                    </Pie>

                    <Tooltip

                      formatter={(value, name) => [

                        `${integer(value)} (${percentage(value, riskTotal)})`,

                        name,

                      ]}

                    />

                  </PieChart>

                </ResponsiveContainer>

              </div>

              <ChartLegend data={riskChartData} total={riskTotal} />

            </div>

          ) : (

            <div className="def-chart-empty">No risk level data.</div>

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

                disabled={page === 0 || loading}

                onClick={() => setPage((value) => Math.max(0, value - 1))}

              >

                <ChevronLeft size={14} />

              </button>

              <button

                type="button"

                disabled={!totalPages || page >= totalPages - 1 || loading}

                onClick={() => setPage((value) => value + 1)}

              >

                <ChevronRight size={14} />

              </button>

            </div>

          </div>

        </div>



        <div className="def-table-scroll">

          <table className="def-reference-table">

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

                <th>

                  Default <span>Score</span>

                </th>

                <th>Default Level</th>

                <th>Risk Level</th>

                <th>GSTR-3A</th>

                <th>Sec 62</th>

                <th className="col-action">Action</th>

              </tr>

            </thead>



            <tbody>

              {loading ? (

                <tr>

                  <td

                    className="def-table-message"

                    colSpan={15}

                  >

                    <Loader2 size={17} className="def-spin" /> Loading records...

                  </td>

                </tr>

              ) : records.length === 0 ? (

                <tr>

                  <td

                    className="def-table-message"

                    colSpan={15}

                  >

                    <FileWarning size={17} /> No records found.

                  </td>

                </tr>

              ) : (

                records.map((row, index) => {

                  const filing = normalizeLevel(row.filingStatus);

                  const defaultValue = normalizeLevel(row.defaultLevel);

                  const risk = normalizeLevel(row.riskLevel);

                  const issued = normalizeLevel(row.gstr3aStatus) === "ISSUED";

                  const eligible =

                    String(row.gstr3aEligible || "").toUpperCase() === "Y";

                  const sec62 =

                    String(row.section62Candidate || "").toUpperCase() === "Y";



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

                      <td className="cell-office">

                        {row.officeName || row.stJuri || "—"}

                      </td>

                      <td className="cell-date">{formatDate(row.dueDate)}</td>

                      <td>

                        <span

                          className={`ref-status filing-${badgeClass(filing)}`}

                        >

                          {humanize(filing)}

                        </span>

                      </td>

                      <td className="cell-date">

                        {formatDate(row.filingDate)}

                      </td>

                      <td

                        className={`cell-delay ${

                          toNumber(row.delayDays) >= 30

                            ? "delay-critical"

                            : toNumber(row.delayDays) > 0

                              ? "delay-warning"

                              : "delay-normal"

                        }`}

                      >

                        {integer(row.delayDays)}

                      </td>

                      <td className="cell-money">{integer(row.outputTax)}</td>

                      <td className="cell-score">

                        {toNumber(row.defaultScore ?? row.riskScore).toFixed(2)}

                      </td>

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

                        <span

                          className={`ref-level risk-${badgeClass(risk)}`}

                        >

                          {humanize(risk)}

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
      />
    </>

  );

}
