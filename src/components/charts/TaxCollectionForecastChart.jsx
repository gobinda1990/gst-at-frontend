import React, { useState } from "react";
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

  // Mapping data and applying optional growth projection to taxable value/cash paid
  const chartData = series.map((item) => ({
    ...item,
    totalTaxableValue: item.totalTaxableValue
      ? item.totalTaxableValue * (1 + projectedGrowth / 100)
      : null,
    totalCashPaid: item.totalCashPaid
      ? item.totalCashPaid * (1 + projectedGrowth / 100)
      : null,
  }));

  const formatYAxis = (value) => {
    if (value === 0 || !value) return "₹0";
    if (value >= 10000000000000) return `₹${(value / 10000000000000).toFixed(1)}L Cr`;
    if (value >= 100000000000) return `₹${(value / 100000000000).toFixed(0)}k Cr`;
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(0)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(0)} L`;
    return `₹${value}`;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border rounded shadow-sm">
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
              <span className="text-secondary small">{entry.name}:</span>
              <strong className="small">
                ₹{new Intl.NumberFormat("en-IN").format(Math.round(entry.value))}
              </strong>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="dash-card p-3 h-100">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h5 className="fw-bold mb-0">Taxable Value vs. Total Cash Paid</h5>
          <small className="text-muted">Transaction scale compared against cash outflows</small>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="small text-muted">Scenario Growth:</span>
          <select
            className="form-select form-select-sm"
            style={{ width: "110px" }}
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

      <ResponsiveContainer width="100%" height={340}>
        <AreaChart data={chartData} margin={{ top: 15, right: 20, left: 20, bottom: 0 }}>
          <defs>
            <linearGradient id="taxableGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="cashPaidGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />

          <XAxis
            dataKey="period"
            tickLine={false}
            axisLine={{ stroke: "#cbd5e1" }}
            tick={{ fill: "#64748b", fontSize: 12 }}
          />

          <YAxis
            tickFormatter={formatYAxis}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#64748b", fontSize: 12 }}
          />

          <Tooltip content={<CustomTooltip />} />
          <Legend verticalAlign="top" align="right" height={36} />

          <Area
            type="monotone"
            name="Total Taxable Value"
            dataKey="totalTaxableValue"
            stroke="#6366f1"
            fill="url(#taxableGradient)"
            strokeWidth={2.5}
          />

          <Area
            type="monotone"
            name="Total Cash Paid"
            dataKey="totalCashPaid"
            stroke="#10b981"
            fill="url(#cashPaidGradient)"
            strokeWidth={2.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TaxableVsCashPaidChart;