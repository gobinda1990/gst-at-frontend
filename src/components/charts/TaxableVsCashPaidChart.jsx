import React, { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

const TaxableVsCashPaidChart = ({ series = [] }) => {
  const [projectedGrowth, setProjectedGrowth] = useState(0);

  // Helper to safely convert incoming data to numbers
  const parseNumericValue = (val) => {
    if (val === null || val === undefined) return 0;
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    // Strip currency symbols, commas, spaces if passed as strings
    const cleaned = String(val).replace(/[^0-9.-]+/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const chartData = useMemo(() => {
    if (!Array.isArray(series) || series.length === 0) return [];

    return series.map((item) => {
      const rawTaxable = parseNumericValue(item?.totalTaxableValue);
      const rawCash = parseNumericValue(item?.totalCashPaid);

      const multiplier = 1 + projectedGrowth / 100;

      return {
        ...item,
        period: item?.period || item?.year || "N/A",
        totalTaxableValue: rawTaxable * multiplier,
        totalCashPaid: rawCash * multiplier,
      };
    });
  }, [series, projectedGrowth]);

  const formatYAxis = (value) => {
    if (!value || value === 0) return "₹0";
    if (value >= 10000000000000) return `₹${(value / 10000000000000).toFixed(1)}L Cr`;
    if (value >= 10000000000) return `₹${(value / 100000000000).toFixed(0)}k Cr`;
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(0)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(0)} L`;
    return `₹${value}`;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border-0 shadow-lg rounded-3 fs-7" style={{ zIndex: 1000 }}>
          <p className="fw-bold mb-2 text-dark">{`Period: ${label}`}</p>
          {payload.map((entry, index) => (
            <div key={`tooltip-${index}`} className="d-flex align-items-center gap-2 mb-1">
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  backgroundColor: entry.color,
                  borderRadius: "50%",
                }}
              />
              <span className="text-muted">{entry.name}:</span>
              <strong className="ms-auto text-dark">
                ₹{new Intl.NumberFormat("en-IN").format(Math.round(entry.value || 0))}
              </strong>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-100" style={{ minHeight: "360px" }}>
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h6 className="fw-bold mb-0 text-slate-800">Taxable Value vs. Total Cash Paid</h6>
          <small className="text-muted">Tax liability compared against cash realization</small>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="fs-8 text-muted">Scenario:</span>
          <select
            className="form-select form-select-sm shadow-none"
            style={{ width: "120px" }}
            value={projectedGrowth}
            onChange={(e) => setProjectedGrowth(Number(e.target.value))}
          >
            <option value={0}>Baseline</option>
            <option value={5}>+5% Growth</option>
            <option value={10}>+10% Growth</option>
            <option value={-5}>-5% Decline</option>
          </select>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div 
          className="d-flex align-items-center justify-content-center border rounded bg-light text-muted fs-7" 
          style={{ height: "300px" }}
        >
          No data available for the selected period
        </div>
      ) : (
        <div style={{ width: "100%", height: "300px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="taxableGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="cashPaidGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />

              <XAxis
                dataKey="period"
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
                tick={{ fill: "#64748b", fontSize: 11 }}
              />

              <YAxis
                tickFormatter={formatYAxis}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#64748b", fontSize: 11 }}
                width={70}
              />

              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '10px', fontSize: '12px' }} />

              <Area
                type="monotone"
                name="Total Taxable Value"
                dataKey="totalTaxableValue"
                stroke="#6366f1"
                fill="url(#taxableGradient)"
                strokeWidth={2}
                connectNulls
              />

              <Area
                type="monotone"
                name="Total Cash Paid"
                dataKey="totalCashPaid"
                stroke="#10b981"
                fill="url(#cashPaidGradient)"
                strokeWidth={2}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default TaxableVsCashPaidChart;