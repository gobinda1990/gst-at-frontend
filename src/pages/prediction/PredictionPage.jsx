import React, { useState } from "react";
import { 
  FaSearch, 
  FaShieldAlt, 
  FaExclamationTriangle, 
  FaCalendarAlt, 
  FaSync, 
  FaRobot, 
  FaBuilding 
} from "react-icons/fa";
import { fetchPrediction } from "../../services/predictionService";
import "./prediction.css";

const PredictionPage = () => {
  const [gstin, setGstin] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const handlePredict = async (e) => {
    if (e) e.preventDefault();
    
    const cleanGstin = gstin.trim().toUpperCase();
    if (!cleanGstin || cleanGstin.length !== 15) {
      setError("Please enter a valid 15-character GSTIN (e.g. 27AABCU9603R1ZM)");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const rawResult = await fetchPrediction(cleanGstin);

      if (!rawResult) {
        setError("No prediction telemetry returned for this GSTIN");
        return;
      }

      // Safe Normalization Fallbacks
      const forecast = rawResult.forecastedCashLiability?.[0] || {};
      const outputTax = rawResult.predictedOutputTax ?? forecast.predictedTaxValue ?? 0;
      const itcAvail = rawResult.predictedItcAvail ?? forecast.predictedItcValue ?? 0;
      
      const normalizedData = {
        ...rawResult,
        predictedOutputTax: outputTax,
        predictedItcAvail: itcAvail,
        predictedTaxableVal: rawResult.predictedTaxableVal ?? (outputTax > 0 ? outputTax / 0.18 : 0),
        predictedItcRatio: rawResult.predictedItcRatio ?? (outputTax > 0 ? itcAvail / outputTax : 0),
        riskTrend: rawResult.riskTrend || rawResult.riskCategory || "STABLE",
        probabilityOfDefault: rawResult.probabilityOfDefault ?? rawResult.lateFilingRiskScore ?? 0,
        targetRetPeriod: rawResult.targetRetPeriod || rawResult.predictionPeriod || "N/A"
      };

      setData(normalizedData);
    } catch (err) {
      console.error(err);
      const backendMessage = err.response?.data?.message || err.response?.data || "Failed to execute AI risk model for this taxpayer.";
      setError(backendMessage);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    if (value === undefined || value === null || isNaN(value)) return "₹0";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const calculateNetPayable = (output, itc) => {
    const net = (output || 0) - (itc || 0);
    return net > 0 ? net : 0;
  };

  const getRiskBadgeClass = (trend) => {
    switch (trend?.toUpperCase()) {
      case "HIGH":
      case "CRITICAL":
      case "INCREASING_RISK":
        return "bg-danger-subtle text-danger border-danger-subtle";
      case "MEDIUM":
      case "DECREASING_RISK":
        return "bg-warning-subtle text-warning-emphasis border-warning-subtle";
      default:
        return "bg-success-subtle text-success border-success-subtle";
    }
  };

  return (
    <div className="enterprise-dashboard bg-slate-50 min-vh-100 p-3 p-lg-4">
      {/* SEARCH HEADER */}
      <div className="card border-0 shadow-sm mb-4 rounded-3">
        <div className="card-body p-3 p-md-4 bg-white">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 pb-3 mb-3 border-bottom">
            <div className="d-flex align-items-center gap-3">
              <div className="p-2.5 bg-primary bg-opacity-10 text-primary rounded-3">
                <FaRobot className="fs-3" />
              </div>
              <div>
                <h4 className="fw-bold text-slate-800 mb-0">Taxpayer Predictive Intelligence</h4>
                <small className="text-muted">Targeted Entity Surveillance & Risk Diagnostics</small>
              </div>
            </div>
            {data && (
              <span className="badge bg-primary-subtle text-primary border border-primary-subtle px-3 py-2 rounded-2 fs-7 d-flex align-items-center gap-1.5">
                <FaBuilding /> Entity: <strong className="font-monospace">{data.gstin}</strong>
              </span>
            )}
          </div>

          <form onSubmit={handlePredict} className="row g-2 align-items-center">
            <div className="col-12 col-md-8 col-lg-6">
              <div className="input-group input-group-lg">
                <span className="input-group-text bg-slate-100 border-end-0 text-muted fs-6"><FaSearch /></span>
                <input
                  type="text"
                  className="form-control border-start-0 bg-slate-100 font-monospace fw-bold uppercase tracking-wider text-primary fs-6"
                  placeholder="Enter 15-Digit GSTIN (e.g. 27AABCU9603R1ZM)"
                  value={gstin}
                  maxLength={15}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                />
              </div>
            </div>
            <div className="col-12 col-md-4 col-lg-3">
              <button
                type="submit"
                className="btn btn-primary btn-lg w-100 fw-bold d-flex align-items-center justify-content-center gap-2 rounded-3 fs-6"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <FaSync className="spin" /> Executing AI Models...
                  </>
                ) : (
                  <>
                    <FaShieldAlt /> Run Risk Assessment
                  </>
                )}
              </button>
            </div>
          </form>

          {error && (
            <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mt-3 mb-0 rounded-3 border-danger-subtle">
              <FaExclamationTriangle className="fs-5 flex-shrink-0" />
              <div>{error}</div>
            </div>
          )}
        </div>
      </div>

      {/* DASHBOARD CONTENT */}
      {data && !loading && (
        <>
          {/* KPI METRICS GRID */}
          <div className="row g-3 mb-4">
            <div className="col-12 col-sm-6 col-xl-3">
              <div className="card metric-card border-0 shadow-sm h-100 p-3 rounded-3 bg-white position-relative overflow-hidden">
                <div className="accent-line bg-primary"></div>
                <span className="text-uppercase text-muted fw-bold fs-8 tracking-wider">Predicted Taxable Turnover</span>
                <h3 className="fw-extrabold text-slate-800 my-2">
                  {formatCurrency(data.predictedTaxableVal)}
                </h3>
                <small className="text-muted fs-7">Output Tax: <strong className="text-slate-700">{formatCurrency(data.predictedOutputTax)}</strong></small>
              </div>
            </div>

            <div className="col-12 col-sm-6 col-xl-3">
              <div className="card metric-card border-0 shadow-sm h-100 p-3 rounded-3 bg-white position-relative overflow-hidden">
                <div className="accent-line bg-warning"></div>
                <span className="text-uppercase text-muted fw-bold fs-8 tracking-wider">Available ITC Projection</span>
                <h3 className="fw-extrabold text-slate-800 my-2">
                  {formatCurrency(data.predictedItcAvail)}
                </h3>
                <small className="text-muted fs-7">
                  ITC/Output Ratio: <strong className="text-warning-emphasis">{data.predictedItcRatio ? (data.predictedItcRatio * 100).toFixed(2) + "%" : "0.00%"}</strong>
                </small>
              </div>
            </div>

            <div className="col-12 col-sm-6 col-xl-3">
              <div className="card metric-card border-0 shadow-sm h-100 p-3 rounded-3 bg-white position-relative overflow-hidden">
                <div className="accent-line bg-success"></div>
                <span className="text-uppercase text-muted fw-bold fs-8 tracking-wider">Net Cash Liability</span>
                <h3 className="fw-extrabold text-success my-2">
                  {formatCurrency(calculateNetPayable(data.predictedOutputTax, data.predictedItcAvail))}
                </h3>
                <small className="text-muted fs-7">Estimated Cash Outflow</small>
              </div>
            </div>

            <div className="col-12 col-sm-6 col-xl-3">
              <div className="card metric-card border-0 shadow-sm h-100 p-3 rounded-3 bg-white position-relative overflow-hidden">
                <div className="accent-line bg-danger"></div>
                <span className="text-uppercase text-muted fw-bold fs-8 tracking-wider">Overall Risk Status</span>
                <div className="mt-2">
                  <span className={`badge border px-3 py-2 fs-7 rounded-2 fw-bold ${getRiskBadgeClass(data.riskTrend)}`}>
                    {data.riskTrend || "STABLE"}
                  </span>
                </div>
                <small className="text-muted fs-7 d-block mt-2">Target Period: <strong className="text-slate-700">{data.targetRetPeriod || "N/A"}</strong></small>
              </div>
            </div>
          </div>

          {/* DETAILED PANELS */}
          <div className="row g-3">
            {/* PANELS LEFT: RISK ENGINE */}
            <div className="col-12 col-lg-6">
              <div className="card border-0 shadow-sm rounded-3 h-100 overflow-hidden">
                <div className="card-header bg-white py-3 px-4 border-bottom-0 d-flex justify-content-between align-items-center">
                  <h6 className="fw-bold mb-0 text-slate-800 d-flex align-items-center gap-2">
                    <FaShieldAlt className="text-danger" /> Risk & Anomaly Diagnostics
                  </h6>
                  <span className="badge bg-slate-100 text-slate-600 border fs-8">AI Model: XGBoost + DL4J</span>
                </div>
                <div className="card-body p-4 pt-0">
                  <div className="p-3 bg-slate-50 rounded-3 border mb-3 text-center">
                    <span className="text-muted fs-8 text-uppercase fw-bold tracking-wider d-block mb-1">Probability of Default</span>
                    <h1 className="display-5 fw-extrabold text-danger mb-0">
                      {data.probabilityOfDefault !== undefined && data.probabilityOfDefault !== null
                        ? (data.probabilityOfDefault * 100).toFixed(1) + "%"
                        : "0%"}
                    </h1>
                  </div>

                  <div className="list-group list-group-flush border-top border-bottom mb-3 fs-7">
                    <div className="list-group-item d-flex justify-content-between align-items-center py-2.5 px-0">
                      <span className="text-muted">Forecasted Risk Factor:</span>
                      <strong className="font-monospace text-slate-800">{data.lateFilingRiskScore?.toFixed(4) || "0.0000"}</strong>
                    </div>
                    <div className="list-group-item d-flex justify-content-between align-items-center py-2.5 px-0">
                      <span className="text-muted">Default Predicted:</span>
                      <span className={`badge px-2.5 py-1 ${data.defaultPrediction ? 'bg-danger text-white' : 'bg-success-subtle text-success'}`}>
                        {data.defaultPrediction ? "YES" : "NO"}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-danger-subtle bg-opacity-50 border border-danger-subtle rounded-3">
                    <small className="text-danger-emphasis fw-bold text-uppercase d-block fs-8 mb-1">Primary Contributing Risk Driver</small>
                    <p className="fw-semibold text-danger mb-0 fs-7 font-monospace">
                      {data.primaryRiskFactor || "NO_CRITICAL_ANOMALIES_DETECTED"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* PANELS RIGHT: TIMELINE & FEES */}
            <div className="col-12 col-lg-6">
              <div className="card border-0 shadow-sm rounded-3 h-100 overflow-hidden">
                <div className="card-header bg-white py-3 px-4 border-bottom-0 d-flex justify-content-between align-items-center">
                  <h6 className="fw-bold mb-0 text-slate-800 d-flex align-items-center gap-2">
                    <FaCalendarAlt className="text-primary" /> Statutory Timeline & Late Fee Exposure
                  </h6>
                </div>
                <div className="card-body p-4 pt-0">
                  <div className="table-responsive">
                    <table className="table table-borderless align-middle fs-7 mb-0">
                      <tbody>
                        <tr className="border-bottom">
                          <td className="py-3 text-muted">Statutory Filing Due Date</td>
                          <td className="py-3 text-end font-monospace fw-bold text-slate-800">{data.dueDate || "N/A"}</td>
                        </tr>
                        <tr className="border-bottom">
                          <td className="py-3 text-muted">Estimated Filing Date</td>
                          <td className="py-3 text-end font-monospace fw-bold text-primary">{data.estimatedFilingDate || "N/A"}</td>
                        </tr>
                        <tr className="border-bottom">
                          <td className="py-3 text-muted">Projected Filing Delay</td>
                          <td className="py-3 text-end">
                            <span className={`badge ${data.delayDays > 15 ? 'bg-danger-subtle text-danger' : 'bg-slate-100 text-slate-700'} px-2.5 py-1.5 fs-7`}>
                              {data.delayDays || 0} Days
                            </span>
                          </td>
                        </tr>
                        <tr className="border-bottom">
                          <td className="py-3 text-muted">Calculated Late Fee Projection</td>
                          <td className="py-3 text-end font-monospace fw-bold text-danger fs-6">
                            {formatCurrency(data.calculatedLateFee)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 p-3 bg-slate-100 rounded-3 d-flex align-items-center justify-content-between">
                    <span className="text-muted fs-8">Calculation Timestamp:</span>
                    <small className="font-monospace text-slate-700 fs-8">
                      {data.calculatedDt ? new Date(data.calculatedDt).toLocaleString() : "N/A"}
                    </small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PredictionPage;