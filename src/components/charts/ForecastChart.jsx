import React from "react";
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

const ForecastChart = ({ series = [] }) => {
  const chartData = Array.isArray(series) && series.length > 0 ? series : [];

  if (chartData.length === 0) {
    return (
      <div className="d-flex align-items-center justify-content-center h-100 text-muted border rounded p-4">
        <span>No forecast trend series available</span>
      </div>
    );
  }

  // Format Y-Axis numbers into readable Indian notation (Crores / Lakh Crores)
  const formatYAxis = (tickItem) => {
    if (tickItem === 0) return "₹0";
    if (tickItem >= 100000000000) return `₹${(tickItem / 100000000000).toFixed(1)}kCr`; // Thousand Crore
    if (tickItem >= 10000000) return `₹${(tickItem / 10000000).toFixed(1)}Cr`; // Crore
    if (tickItem >= 100000) return `₹${(tickItem / 100000).toFixed(1)}L`; // Lakh
    if (tickItem >= 1000) return `₹${(tickItem / 1000).toFixed(0)}k`;
    return `₹${tickItem}`;
  };

  // Custom Tooltip for enhanced readability
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border rounded shadow-sm">
          <p className="fw-bold mb-2 text-dark">{label}</p>
          {payload.map((entry, index) => (
            <div key={`item-${index}`} className="d-flex align-items-center gap-2 mb-1">
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  backgroundColor: entry.color,
                  borderRadius: "50%",
                  display: "inline-block",
                }}
              />
              <span className="text-secondary small">{entry.name}:</span>
              <strong className="small">
                ₹{new Intl.NumberFormat("en-IN").format(entry.value)}
              </strong>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // Keys Resolution
  const sample = chartData[0] || {};
  const xKey = sample.month !== undefined ? "month" : sample.period !== undefined ? "period" : "date";
  const primaryValueKey = sample.value !== undefined ? "value" : sample.amount !== undefined ? "amount" : "predicted";
  const hasActuals = sample.actual !== undefined;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 15, bottom: 0 }}>
        <defs>
          <linearGradient id="predictedGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ff6b00" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#ff6b00" stopOpacity={0.0} />
          </linearGradient>
          <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={{ stroke: "#e5e7eb" }}
          tick={{ fill: "#6b7280", fontSize: 12 }}
        />
        
        <YAxis
          tickFormatter={formatYAxis}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#6b7280", fontSize: 12 }}
        />
        
        <Tooltip content={<CustomTooltip />} />
        
        {hasActuals && <Legend verticalAlign="top" height={36} />}

        {hasActuals && (
          <Area
            type="monotone"
            name="Actual Collection"
            dataKey="actual"
            stroke="#0284c7"
            fill="url(#actualGradient)"
            strokeWidth={2}
          />
        )}

        <Area
          type="monotone"
          name="Predicted Collection"
          dataKey={primaryValueKey}
          stroke="#ff6b00"
          fill="url(#predictedGradient)"
          strokeWidth={3}
          activeDot={{ r: 6 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default ForecastChart;