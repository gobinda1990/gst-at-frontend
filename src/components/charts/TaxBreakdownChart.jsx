import React from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart
} from "recharts";

const COLORS = {
  IGST: "#2563eb",   // Blue
  CGST: "#dc2626",   // Red
  SGST: "#059669",   // Green
  CESS: "#f59e0b"    // Amber
};

// Helper to safely format numbers with Indian locale separator (full raw value)
const formatCurrency = (val) => `₹${Number(val || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// Helper for safe numeric extraction across naming conventions
const getNum = (item, key) => Number(item?.[key] || 0);

/**
 * TaxBreakdownChart - Period-wise tax component breakdown
 */
export const TaxBreakdownChart = ({ series = [] }) => {
  if (!series || series.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
        No tax data available
      </div>
    );
  }

  const chartData = series.map((item) => {
    const igst = getNum(item, "igst");
    const cgst = getNum(item, "cgst");
    const sgst = getNum(item, "sgst");
    const cess = getNum(item, "cess");
    const total = getNum(item, "totalTax") || (igst + cgst + sgst + cess);

    return {
      period: formatPeriodShort(item.period),
      fullPeriod: formatPeriodLabel(item.period),
      IGST: igst,
      CGST: cgst,
      SGST: sgst,
      CESS: cess,
      totalTax: total
    };
  });

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    return (
      <div style={{
        backgroundColor: "#fff",
        border: "1px solid #ccc",
        borderRadius: "4px",
        padding: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
      }}>
        <p style={{ margin: 0, fontWeight: "bold", fontSize: "12px" }}>
          {payload[0]?.payload?.fullPeriod}
        </p>
        {payload.map((entry, idx) => (
          <p key={idx} style={{ margin: "4px 0", fontSize: "11px", color: entry.color }}>
            {entry.name}: {formatCurrency(entry.value)}
          </p>
        ))}
        <p style={{ margin: "4px 0 0 0", fontSize: "11px", fontWeight: "bold", borderTop: "1px solid #eee", paddingTop: "4px" }}>
          Total: {formatCurrency(payload.reduce((sum, p) => sum + (p.value || 0), 0))}
        </p>
      </div>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: "12px" }}>
        <h6 style={{ margin: 0, fontSize: "14px", fontWeight: "600" }}>Tax Component Breakdown (Period-wise)</h6>
        <small style={{ color: "#666" }}>IGST, CGST, SGST, CESS collected</small>
      </div>
      <div style={{ width: "100%", height: 300, minHeight: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis 
              dataKey="period" 
              angle={-45} 
              textAnchor="end" 
              height={70}
              tick={{ fontSize: 11 }}
            />
            <YAxis 
              label={{ value: "Amount (₹)", angle: -90, position: "insideLeft" }}
              tick={{ fontSize: 11 }}
              tickFormatter={(value) => `₹${value.toLocaleString("en-IN")}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ paddingTop: "20px" }}
              iconType="square"
              verticalAlign="top"
            />
            <Bar dataKey="IGST" fill={COLORS.IGST} radius={[4, 4, 0, 0]} />
            <Bar dataKey="CGST" fill={COLORS.CGST} radius={[4, 4, 0, 0]} />
            <Bar dataKey="SGST" fill={COLORS.SGST} radius={[4, 4, 0, 0]} />
            <Bar dataKey="CESS" fill={COLORS.CESS} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

/**
 * CashPaidVsCollectedChart - Tax Collected vs Cash Paid by period
 */
export const CashPaidVsCollectedChart = ({ series = [] }) => {
  if (!series || series.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
        No cash payment data available
      </div>
    );
  }

  const chartData = series.map((item) => {
    const igst = getNum(item, "igst");
    const cgst = getNum(item, "cgst");
    const sgst = getNum(item, "sgst");
    const cess = getNum(item, "cess");
    const paidIgst = getNum(item, "cashIgstPaid");
    const paidCgst = getNum(item, "cashCgstPaid");
    const paidSgst = getNum(item, "cashSgstPaid");
    const paidCess = getNum(item, "cashCessPaid");

    const totalCollected = getNum(item, "totalTax") || (igst + cgst + sgst + cess);
    const totalPaid = getNum(item, "cashTaxPaid") || (paidIgst + paidCgst + paidSgst + paidCess);

    return {
      period: formatPeriodShort(item.period),
      fullPeriod: formatPeriodLabel(item.period),
      collectedIGST: igst,
      paidIGST: paidIgst,
      collectedCGST: cgst,
      paidCGST: paidCgst,
      collectedSGST: sgst,
      paidSGST: paidSgst,
      collectedCESS: cess,
      paidCESS: paidCess,
      totalCollected,
      totalPaid
    };
  });

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload[0]) return null;
    const data = payload[0].payload;
    return (
      <div style={{
        backgroundColor: "#fff",
        border: "1px solid #ccc",
        borderRadius: "4px",
        padding: "10px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        fontSize: "11px"
      }}>
        <p style={{ margin: 0, fontWeight: "bold", marginBottom: "8px" }}>{data.fullPeriod}</p>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <tbody>
            {["IGST", "CGST", "SGST", "CESS"].map((tax) => (
              <tr key={tax} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ paddingRight: "12px", color: COLORS[tax] }}>{tax}:</td>
                <td style={{ textAlign: "right", paddingRight: "8px" }}>
                  Coll: {formatCurrency(data[`collected${tax}`])}
                </td>
                <td style={{ textAlign: "right" }}>
                  Paid: {formatCurrency(data[`paid${tax}`])}
                </td>
              </tr>
            ))}
            <tr style={{ fontWeight: "bold", borderTop: "2px solid #333" }}>
              <td style={{ paddingRight: "12px" }}>Total:</td>
              <td style={{ textAlign: "right", paddingRight: "8px" }}>
                {formatCurrency(data.totalCollected)}
              </td>
              <td style={{ textAlign: "right" }}>
                {formatCurrency(data.totalPaid)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: "12px" }}>
        <h6 style={{ margin: 0, fontSize: "14px", fontWeight: "600" }}>Tax Collected vs Cash Paid</h6>
        <small style={{ color: "#666" }}>Period-wise comparison by tax component</small>
      </div>
      <div style={{ width: "100%", height: 320, minHeight: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis 
              dataKey="period" 
              angle={-45} 
              textAnchor="end" 
              height={70}
              tick={{ fontSize: 11 }}
            />
            <YAxis 
              yAxisId="left"
              label={{ value: "Amount (₹)", angle: -90, position: "insideLeft" }}
              tick={{ fontSize: 11 }}
              tickFormatter={(value) => `₹${value.toLocaleString("en-IN")}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ paddingTop: "20px" }}
              verticalAlign="top"
            />
            <Bar yAxisId="left" dataKey="totalCollected" fill="#e0e7ff" name="Total Collected" radius={[4, 4, 0, 0]} />
            <Line 
              yAxisId="left" 
              type="monotone" 
              dataKey="totalPaid" 
              stroke="#dc2626" 
              strokeWidth={3} 
              dot={{ fill: "#dc2626", r: 5 }} 
              activeDot={{ r: 7 }}
              name="Total Cash Paid"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

/**
 * TaxCollectionSummaryTable - Detailed period-wise breakdown table
 */
export const TaxCollectionSummaryTable = ({ series = [] }) => {
  if (!series || series.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "20px", color: "#999" }}>
        No data available
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: "12px" }}>
        <h6 style={{ margin: 0, fontSize: "14px", fontWeight: "600" }}>Period-wise Tax Summary</h6>
        <small style={{ color: "#666" }}>Detailed tax collection and payment breakdown</small>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "12px",
          fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
        }}>
          <thead>
            <tr style={{ backgroundColor: "#f3f4f6", borderBottom: "2px solid #d1d5db" }}>
              <th style={{ padding: "10px", textAlign: "left", fontWeight: "600" }}>Period</th>
              <th style={{ padding: "10px", textAlign: "right", fontWeight: "600", color: COLORS.IGST }}>IGST</th>
              <th style={{ padding: "10px", textAlign: "right", fontWeight: "600", color: COLORS.CGST }}>CGST</th>
              <th style={{ padding: "10px", textAlign: "right", fontWeight: "600", color: COLORS.SGST }}>SGST</th>
              <th style={{ padding: "10px", textAlign: "right", fontWeight: "600", color: COLORS.CESS }}>CESS</th>
              <th style={{ padding: "10px", textAlign: "right", fontWeight: "600" }}>Total Tax</th>
              <th style={{ padding: "10px", textAlign: "right", fontWeight: "600" }}>Cash Paid</th>
              <th style={{ padding: "10px", textAlign: "right", fontWeight: "600" }}>Ratio</th>
            </tr>
          </thead>
          <tbody>
            {series.map((item, idx) => {
              const igst = getNum(item, "igst");
              const cgst = getNum(item, "cgst");
              const sgst = getNum(item, "sgst");
              const cess = getNum(item, "cess");
              const totalTax = getNum(item, "totalTax") || (igst + cgst + sgst + cess);
              const cashPaid = getNum(item, "cashTaxPaid");
              const ratioNum = getNum(item, "paymentRatioPercent") || (totalTax > 0 ? (cashPaid / totalTax) * 100 : 0);
              const ratio = ratioNum.toFixed(1);

              return (
                <tr 
                  key={idx} 
                  style={{ 
                    borderBottom: "1px solid #e5e7eb",
                    backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f9fafb",
                    transition: "background-color 0.2s"
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#f0f4ff"}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? "#ffffff" : "#f9fafb"}
                >
                  <td style={{ padding: "10px", fontWeight: "600" }}>{formatPeriodLabel(item.period)}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{formatCurrency(igst)}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{formatCurrency(cgst)}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{formatCurrency(sgst)}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{formatCurrency(cess)}</td>
                  <td style={{ padding: "10px", textAlign: "right", fontWeight: "600" }}>{formatCurrency(totalTax)}</td>
                  <td style={{ padding: "10px", textAlign: "right", fontWeight: "600", color: "#059669" }}>{formatCurrency(cashPaid)}</td>
                  <td style={{ 
                    padding: "10px", 
                    textAlign: "right", 
                    fontWeight: "600",
                    color: ratio >= 80 ? "#059669" : ratio >= 50 ? "#f59e0b" : "#dc2626"
                  }}>
                    {ratio}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function formatPeriodShort(periodCode) {
  if (!periodCode || periodCode === "ALL") return "All";
  const str = String(periodCode);
  if (str.length !== 6) return str;
  
  try {
    const month = parseInt(str.substring(0, 2), 10);
    const year = str.substring(2, 4);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[month - 1] || "?"} '${year}`;
  } catch {
    return str;
  }
}

function formatPeriodLabel(periodCode) {
  if (!periodCode || periodCode === "ALL") return "All History";
  const str = String(periodCode);
  if (str.length !== 6) return str;
  
  try {
    const month = parseInt(str.substring(0, 2), 10);
    const year = str.substring(2);
    const date = new Date(year, month - 1);
    return date.toLocaleString("en-IN", { month: "short", year: "numeric" });
  } catch {
    return str;
  }
}

export default TaxBreakdownChart;