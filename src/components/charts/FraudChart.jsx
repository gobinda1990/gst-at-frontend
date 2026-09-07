import React from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

const FraudChart = ({ series = [] }) => {
  const formatYAxisCurrency = (value) => {
    if (value === 0 || !value) return "₹0";
    if (value >= 1000000000000) return `₹${(value / 1000000000000).toFixed(1)}L Cr`;
    if (value >= 1000000000) return `₹${(value / 1000000000).toFixed(0)}k Cr`;
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(0)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(0)} L`;
    return `₹${value}`;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border-0 shadow-lg rounded-3 fs-7">
          <p className="fw-bold mb-2 text-dark">{`Period: ${label}`}</p>
          {payload.map((entry, index) => {
            const isCount = entry.dataKey === "anomalyCount";
            return (
              <div key={`fraud-tt-${index}`} className="d-flex align-items-center gap-2 mb-1">
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
                  {isCount
                    ? new Intl.NumberFormat("en-IN").format(entry.value)
                    : `₹${new Intl.NumberFormat("en-IN").format(Math.round(entry.value))}`}
                </strong>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="fraud-chart-wrapper w-100">
      <div className="mb-3">
        <h6 className="fw-bold mb-0 text-slate-800">ITC Claim vs Liability Trends</h6>
        <small className="text-muted">Anomaly detection overlay across financial cycles</small>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={series} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />

          <XAxis
            dataKey="period"
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
            tick={{ fill: "#64748b", fontSize: 11 }}
          />

          <YAxis
            yAxisId="left"
            tickFormatter={formatYAxisCurrency}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#64748b", fontSize: 11 }}
          />

          <YAxis
            yAxisId="right"
            orientation="right"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#ef4444", fontSize: 11 }}
            tickFormatter={(val) => `${val}`}
          />

          <Tooltip content={<CustomTooltip />} />
          <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '10px', fontSize: '12px' }} />

          <Bar
            yAxisId="left"
            name="Total ITC Claimed"
            dataKey="totalItcClaimed"
            fill="#f59e0b"
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />

          <Bar
            yAxisId="left"
            name="Flagged Excess ITC"
            dataKey="flaggedExcessItc"
            fill="#ef4444"
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />

          <Line
            yAxisId="right"
            type="monotone"
            name="Anomaly Count"
            dataKey="anomalyCount"
            stroke="#dc2626"
            strokeWidth={2}
            dot={{ r: 3, fill: "#dc2626" }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default FraudChart;