import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  FaSyncAlt, FaBroom, FaExclamationTriangle, FaCheckCircle,
  FaFileDownload, FaSearch, FaHistory, FaShieldAlt
} from "react-icons/fa";

import TaxableVsCashPaidChart from "../../components/charts/TaxableVsCashPaidChart";
import FraudChart from "../../components/charts/FraudChart";
import {
  TaxBreakdownChart,
  CashPaidVsCollectedChart,
  TaxCollectionSummaryTable
} from "../../components/charts/TaxBreakdownChart";
import { fetchDashboardMetrics, refreshDashboardCache } from "../../services/dashboardService";

import "./dashboard.css";

/* ============================================================
 * HELPERS
 * ============================================================ */

const formatPeriodLabel = (periodCode) => {
  if (!periodCode || periodCode === "ALL") return "All History (Lifetime)";
  if (typeof periodCode !== "string") return String(periodCode);
  if (periodCode.length === 6 && Number(periodCode.substring(0, 2)) <= 12) {
    const month = parseInt(periodCode.substring(0, 2), 10) - 1;
    const year = parseInt(periodCode.substring(2), 10);
    const date = new Date(year, month);
    return date.toLocaleString("en-IN", { month: "short", year: "numeric" });
  }
  return periodCode;
};

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const formatCompactCurrency = (amount) => {
  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) return "₹0";
  const val = Number(amount);
  if (val >= 1e12) return `₹${(val / 1e12).toFixed(2)} L Cr`;
  if (val >= 1e7) return `₹${(val / 1e7).toFixed(2)} Cr`;
  if (val >= 1e5) return `₹${(val / 1e5).toFixed(2)} L`;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val);
};

const formatRawCurrency = (amount) => {
  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) return "₹0";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(amount));
};

const formatNumber = (num) => {
  if (num === undefined || num === null || Number.isNaN(Number(num))) return "0";
  return new Intl.NumberFormat("en-IN").format(num);
};

const formatRatio = (val) => {
  if (val === undefined || val === null || Number.isNaN(Number(val))) return "0.00%";
  const num = Number(val);
  const percentage = num <= 1 && num > 0 ? num * 100 : num;
  return `${percentage.toFixed(2)}%`;
};

const getRiskClass = (category) => {
  const value = String(category || "").trim().toUpperCase();
  if (value === "CRITICAL") return "critical";
  if (value === "HIGH") return "high";
  if (value === "MEDIUM") return "medium";
  return "low";
};

/* ============================================================
 * MAIN COMPONENT
 * ============================================================ */

const DashboardPage = () => {
  const [retPeriod, setRetPeriod] = useState("ALL");
  const [stateCode, setStateCode] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 400);

  const [periodsList, setPeriodsList] = useState([]);
  const [jurisdictionsList, setJurisdictionsList] = useState([]);

  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshingCache, setRefreshingCache] = useState(false);
  const [error, setError] = useState("");

  const loadDashboardData = useCallback(async (forceRefresh = false, signal) => {
    try {
      setLoading(true);
      setError("");

      const data = await fetchDashboardMetrics({
        gstin: debouncedSearchTerm.trim(),
        retPeriod: retPeriod === "ALL" ? "" : retPeriod,
        stateCode,
        forceRefresh,
        signal
      });

      setMetrics(data);

      if (data?.availablePeriods && Array.isArray(data.availablePeriods)) {
        const normalizedPeriods = data.availablePeriods.map((p) => {
          if (typeof p === "string") return { code: p, label: formatPeriodLabel(p) };
          return {
            code: p.code || p.value || p.retPeriod,
            label: p.label || p.name || formatPeriodLabel(p.code || p.value || p.retPeriod)
          };
        });
        setPeriodsList([{ code: "ALL", label: "All History (Lifetime)" }, ...normalizedPeriods]);
      }

      if (data?.jurisdictions && Array.isArray(data.jurisdictions)) {
        setJurisdictionsList(data.jurisdictions);
      }
    } catch (err) {
      if (err.name !== "CanceledError" && err.name !== "AbortError") {
        console.error("Dashboard Load Error:", err);
        setError(err.response?.data?.message || "Failed to load GSTR-3B analytics data.");
      }
    } finally {
      setLoading(false);
    }
  }, [retPeriod, stateCode, debouncedSearchTerm]);

  useEffect(() => {
    const controller = new AbortController();
    loadDashboardData(false, controller.signal);
    return () => controller.abort();
  }, [loadDashboardData]);

  const handleCacheEviction = async () => {
    try {
      setRefreshingCache(true);
      await refreshDashboardCache();
      await loadDashboardData(true);
    } catch (err) {
      console.error("Cache Eviction Failed:", err);
      setError("Failed to invalidate analytics cache.");
    } finally {
      setRefreshingCache(false);
    }
  };

  const showSkeleton = loading && !metrics;
  const queueRows = metrics?.topHighRiskGstins?.slice(0, 5) || [];
  const alertRows = metrics?.recentAlerts || [];

  // Memoize fallback array for chart components to avoid extra child re-renders
  const taxSummarySeries = useMemo(() => {
    return metrics?.taxsummary || metrics?.taxCollectionSeries || [];
  }, [metrics]);

  return (
    <div className="dash-container">
      <div className="dash-topbar">
        <div className="dash-shell dash-topbar-inner">
          <div className="dash-brand">
            <div className="dash-brand-icon"><FaShieldAlt /></div>
            <div>
              <h1>GST Intelligence &amp; Audit Portal</h1>
              <small>Executive &amp; intelligence surveillance dashboard</small>
            </div>
          </div>

          <div className="dash-status-group">
            {retPeriod === "ALL" && (
              <span className="dash-status-chip"><FaHistory />Lifetime History</span>
            )}
            <span className="dash-status-chip live"><FaCheckCircle />Risk Engine Active</span>

            <div className="dash-divider-v" />

            <button type="button" className="dash-action-btn">
              <FaFileDownload /><span>Export</span>
            </button>
            <button
              type="button" className="dash-action-btn primary"
              onClick={() => loadDashboardData(false)} disabled={loading || refreshingCache}
            >
              <FaSyncAlt className={loading ? "spin" : ""} /><span>Sync</span>
            </button>
            <button
              type="button" className="dash-action-btn danger"
              onClick={handleCacheEviction} title="Purge Analytics Cache" disabled={refreshingCache}
            >
              <FaBroom /><span>Purge</span>
            </button>
          </div>
        </div>
      </div>

      <div className="dash-shell">
        <div className="dash-filter-bar">
          <div className="dash-filter-field">
            <label htmlFor="dash-search">GSTIN / Legal Name</label>
            <div className="dash-search-input">
              <FaSearch />
              <input
                id="dash-search"
                type="text"
                placeholder="Filter by GSTIN or legal name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="dash-filter-field">
            <label htmlFor="dash-period">Return Period</label>
            <select
              id="dash-period" className="dash-select" value={retPeriod}
              onChange={(e) => setRetPeriod(e.target.value)} disabled={loading && periodsList.length === 0}
            >
              <option value="ALL">All History (Lifetime)</option>
              {periodsList.map((item) => item.code !== "ALL" && (
                <option key={item.code} value={item.code}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="dash-filter-field">
            <label htmlFor="dash-jurisdiction">Jurisdiction</label>
            <select
              id="dash-jurisdiction" className="dash-select" value={stateCode}
              onChange={(e) => setStateCode(e.target.value)} disabled={loading && jurisdictionsList.length === 0}
            >
              <option value="">All Jurisdictions (India)</option>
              {jurisdictionsList.map((item) => (
                <option key={item.code || item.stateCode} value={item.code || item.stateCode}>
                  {item.code ? `${item.code} - ${item.name}` : item.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="dash-error-banner">
            <FaExclamationTriangle />
            <div>{error}</div>
          </div>
        )}

        {showSkeleton ? (
          <div className="dash-kpi-grid">
            {[0, 1, 2, 3].map((i) => <div className="dash-skeleton dash-skeleton-kpi" key={i} />)}
          </div>
        ) : (
          <div className="dash-kpi-grid">
            <div className="dash-kpi-card">
              <span className="dash-kpi-label">
                {retPeriod === "ALL" ? "Total Taxable Output (Lifetime)" : "Total Taxable Output"}
              </span>
              <div className="dash-kpi-value-row">
                <span className="dash-kpi-value" title={formatRawCurrency(metrics?.totalTaxableValue)}>
                  {formatCompactCurrency(metrics?.totalTaxableValue)}
                </span>
              </div>
              <div className="dash-kpi-foot">
                Across <strong>{formatNumber(metrics?.totalGstins)}</strong> taxpayers
              </div>
            </div>

            <div className="dash-kpi-card success">
              <span className="dash-kpi-label">
                {retPeriod === "ALL" ? "Total Cash Paid (Lifetime)" : "Total Cash Paid"}
              </span>
              <div className="dash-kpi-value-row">
                <span className="dash-kpi-value" title={formatRawCurrency(metrics?.totalCashPaid)}>
                  {formatCompactCurrency(metrics?.totalCashPaid)}
                </span>
              </div>
              <div className="dash-kpi-foot success">
                Cash ratio <strong>{formatRatio(metrics?.avgCashPaymentRatio)}</strong>
              </div>
            </div>

            <div className="dash-kpi-card warning">
              <span className="dash-kpi-label">
                {retPeriod === "ALL" ? "Total ITC Utilized (Lifetime)" : "ITC Utilized"}
              </span>
              <div className="dash-kpi-value-row">
                <span className="dash-kpi-value" title={formatRawCurrency(metrics?.totalUtilizedItc)}>
                  {formatCompactCurrency(metrics?.totalUtilizedItc)}
                </span>
              </div>
              <div className="dash-kpi-foot warning">
                Utilization <strong>{formatRatio(metrics?.avgItcUtilizationRatio)}</strong>
              </div>
            </div>

            <div className="dash-kpi-card danger">
              <span className="dash-kpi-label">High-Risk Anomaly Flags</span>
              <div className="dash-kpi-value-row">
                <span className="dash-kpi-value">{formatNumber(metrics?.fraudAlertsCount)}</span>
                <span className="dash-kpi-chip">Defaults {formatNumber(metrics?.predictedDefaultsCount)}</span>
              </div>
              <div className="dash-kpi-foot">Requires audit verification</div>
            </div>
          </div>
        )}

        <div className="dash-secondary-grid">
          <div className="dash-secondary-card">
            <span className="dash-secondary-label">Excess / Invalid ITC</span>
            <div className="dash-secondary-value danger">{formatCompactCurrency(metrics?.totalExcessItc)}</div>
          </div>
          <div className="dash-secondary-card">
            <span className="dash-secondary-label">RCM Tax Collection</span>
            <div className="dash-secondary-value primary">{formatCompactCurrency(metrics?.totalRcmTax)}</div>
          </div>
          <div className="dash-secondary-card">
            <span className="dash-secondary-label">Avg Filing Delay</span>
            <div className="dash-secondary-value warning">{Number(metrics?.avgFilingDelayDays || 0).toFixed(1)} days</div>
          </div>
          <div className="dash-secondary-card">
            <span className="dash-secondary-label">E-Commerce Turnover</span>
            <div className="dash-secondary-value info">{formatCompactCurrency(metrics?.totalEcommerceTurnover)}</div>
          </div>
        </div>

        {/* ============================================================
            TAX BREAKDOWN & CASH PAID CHARTS
            ============================================================ */}
        <div className="dash-tax-summary-section">
          <div className="dash-section-title">
            <h5>📊 Tax Collection Summary (Period-wise)</h5>
            <small>Detailed breakdown of IGST, CGST, SGST, CESS and cash payments</small>
          </div>

          <div className="dash-tax-chart-grid">
            <div className="dash-panel dash-panel-full">
              <div className="dash-panel-body">
                <TaxBreakdownChart series={taxSummarySeries} />
              </div>
            </div>

            <div className="dash-panel dash-panel-full">
              <div className="dash-panel-body">
                <CashPaidVsCollectedChart series={taxSummarySeries} />
              </div>
            </div>
          </div>

          <div className="dash-panel dash-panel-full">
            <div className="dash-panel-body">
              <TaxCollectionSummaryTable series={taxSummarySeries} />
            </div>
          </div>
        </div>

        {/* ============================================================
            EXISTING CHARTS
            ============================================================ */}
        <div className="dash-chart-grid">
          <div className="dash-panel">
            <div className="dash-panel-body">
              <TaxableVsCashPaidChart series={metrics?.forecastSeries || []} />
            </div>
          </div>
          <div className="dash-panel">
            <div className="dash-panel-body">
              <FraudChart series={metrics?.fraudSeries || []} />
            </div>
          </div>
        </div>

        {/* ============================================================
            PRIORITY AUDIT QUEUE & ALERTS
            ============================================================ */}
        <div className="dash-bottom-grid">
          <div className="dash-panel">
            <div className="dash-panel-header">
              <div>
                <h6>Priority Taxpayer Audit Queue</h6>
                <small>High-risk taxpayers flagged for instant review</small>
              </div>
              <button type="button" className="dash-link-btn">
                View All ({metrics?.topHighRiskGstins?.length || 0})
              </button>
            </div>
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>GSTIN</th>
                    <th>Taxable Value</th>
                    <th>ITC Ratio</th>
                    <th>Cash Ratio</th>
                    <th>Delay</th>
                    <th>Risk Score</th>
                    <th>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {queueRows.length === 0 ? (
                    <tr className="dash-empty-row"><td colSpan={7}>No high-risk taxpayers for the current filters.</td></tr>
                  ) : queueRows.map((item, idx) => {
                    const riskClass = getRiskClass(item.riskCategory);
                    const rowKey = item.id || (item.gstin ? `${item.gstin}_${item.retPeriod || idx}` : `row_${idx}`);
                    return (
                      <tr key={rowKey}>
                        <td>{item.gstin}</td>
                        <td>{formatCompactCurrency(item.taxableValue)}</td>
                        <td className="dash-ratio-danger">{formatRatio(item.itcUtilizationRatio)}</td>
                        <td className="dash-ratio-good">{formatRatio(item.cashPaymentRatio)}</td>
                        <td>
                          <span className={`dash-delay-chip ${item.filingDelayDays > 15 ? "over" : ""}`}>
                            {item.filingDelayDays || 0}d
                          </span>
                        </td>
                        <td>{Number(item.xgbRiskScore || 0).toFixed(3)}</td>
                        <td>
                          <span className={`dash-risk-badge ${riskClass}`}>{item.riskCategory || "HIGH"}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dash-panel">
            <div className="dash-panel-header">
              <div>
                <h6>System Risk Alerts</h6>
                <small>Real-time system generated flags</small>
              </div>
            </div>
            <div className="dash-alerts-scroll">
              {alertRows.length === 0 ? (
                <div className="dash-empty-row" style={{ padding: "24px 4px" }}>
                  No active system alerts.
                </div>
              ) : alertRows.map((alert, idx) => (
                <div className="dash-alert-card" key={alert.id || `alert_${idx}`}>
                  <div className="dash-alert-top">
                    <span className="dash-alert-gstin">{alert.gstin || "SYSTEM"}</span>
                    <span className="dash-alert-period">{alert.retPeriod}</span>
                  </div>
                  <p className="dash-alert-message">{alert.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;