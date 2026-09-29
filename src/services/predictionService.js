import { apiClient as dashboardClient } from "./apiClient";

const LAKH_MULTIPLIER = 100000;

/* ============================================================
 * NUMBER UTILITIES
 * ============================================================ */

/**
 * Convert a value safely to Number.
 */
const safeNumber = (value, defaultValue = 0) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : defaultValue;
};

/**
 * Normalize a value already stored in INR/Rupees.
 *
 * Example:
 * 28171.63 -> 28171.63
 */
const rawRupees = (value) => {
  return safeNumber(value);
};

/**
 * Normalize a prediction value stored in Lakhs
 * to standard INR Rupees.
 *
 * Example:
 * 10.50 -> 1050000
 */
const toRupees = (value) => {
  return safeNumber(value) * LAKH_MULTIPLIER;
};


/* ============================================================
 * DISPLAY FORMATTERS
 * ============================================================ */

/**
 * Format INR clearly.
 *
 * 28171.63
 *     -> ₹28,171.63
 *
 * 1087411.46
 *     -> ₹10,87,411.46
 */
export const formatINR = (value) => {
  const number = safeNumber(value);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(number);
};


/**
 * Format INR in compact form.
 *
 * 28171.63
 *     -> ₹28.17K
 *
 * 1087411.46
 *     -> ₹10.87L
 *
 * 12500000
 *     -> ₹1.25Cr
 */
export const formatINRCompact = (value) => {
  const number = safeNumber(value);
  const absolute = Math.abs(number);

  if (absolute >= 10000000) {
    return `₹${(number / 10000000).toFixed(2)}Cr`;
  }

  if (absolute >= 100000) {
    return `₹${(number / 100000).toFixed(2)}L`;
  }

  if (absolute >= 1000) {
    return `₹${(number / 1000).toFixed(2)}K`;
  }

  return `₹${number.toFixed(2)}`;
};


/**
 * Format decimal ratio as percentage.
 *
 * 0.8851
 *     -> 88.51%
 *
 * 0.010817
 *     -> 1.08%
 */
export const formatPercentage = (value) => {
  const number = safeNumber(value);

  return `${(number * 100).toFixed(2)}%`;
};


/**
 * Format MMYYYY.
 *
 * 052026 -> 05/2026
 */
export const formatReturnPeriod = (period) => {
  if (!period) {
    return "N/A";
  }

  const value = String(period);

  if (
    value.length === 6 &&
    /^\d{6}$/.test(value)
  ) {
    return `${value.substring(0, 2)}/${value.substring(2)}`;
  }

  return value;
};


/**
 * Format MMYYYY to "May 2026".
 *
 * 052026 -> May 2026
 */
const formatPeriodLabel = (periodCode) => {
  if (!periodCode) {
    return "N/A";
  }

  const period = String(periodCode).trim();

  if (
    period.length === 6 &&
    /^\d{6}$/.test(period)
  ) {
    const month = Number(
      period.substring(0, 2)
    );

    const year = Number(
      period.substring(2, 6)
    );

    if (month >= 1 && month <= 12) {
      const date = new Date(
        year,
        month - 1,
        1
      );

      return date.toLocaleString(
        "en-IN",
        {
          month: "short",
          year: "numeric"
        }
      );
    }
  }

  return period;
};


/* ============================================================
 * RATIO
 * ============================================================ */

/**
 * Safely calculate ratio.
 *
 * Example:
 *
 * ITC = 56344
 * Output Tax = 56343.26
 *
 * Result:
 * 1.000013
 */
const calculateRatio = (
  numerator,
  denominator
) => {

  const num = safeNumber(numerator);
  const den = safeNumber(denominator);

  if (den <= 0) {
    return 0;
  }

  return num / den;
};


/* ============================================================
 * FILING STATUS
 * ============================================================ */

const determineFilingStatus = (
  status,
  delayDays
) => {

  if (status) {
    return status;
  }

  if (delayDays > 0) {
    return "DELAYED";
  }

  return "FILED";
};


/* ============================================================
 * PREDICTION API
 * ============================================================ */

/**
 * Fetch predictive risk metrics
 * and forecasted cash liabilities.
 */
export const fetchPrediction = async (
  gstin,
  forecastPeriods = 1
) => {

  try {

    const cleanGstin =
      gstin?.trim().toUpperCase();

    if (!cleanGstin) {
      throw new Error(
        "GSTIN parameter is required"
      );
    }

    const response =
      await dashboardClient.post(
        "/gst/return-3b/predict",
        {
          gstin: cleanGstin,
          forecastPeriods
        }
      );

    const raw =
      response.data || {};

    /*
     * Extract primary forecast.
     */
    const primaryForecast =
      Array.isArray(
        raw.forecastedCashLiability
      ) &&
      raw.forecastedCashLiability.length > 0
        ? raw.forecastedCashLiability[0]
        : {};

    const rawTaxVal =
      safeNumber(
        primaryForecast.predictedTaxValue
      );

    const rawItcVal =
      safeNumber(
        primaryForecast.predictedItcValue
      );

    /*
     * Prediction values are assumed
     * to be supplied in Lakhs.
     */
    const taxInRupees =
      toRupees(rawTaxVal);

    const itcInRupees =
      toRupees(rawItcVal);

    return {

      gstin:
        raw.gstin || cleanGstin,

      riskTrend:
        raw.riskCategory || "LOW",

      probabilityOfDefault:
        safeNumber(
          raw.lateFilingRiskScore
        ),

      forecastedRiskScore:
        safeNumber(
          raw.lateFilingRiskScore
        ),

      defaultPredicted:
        Boolean(
          raw.defaultPrediction
        ),

      predictionSource:
        raw.predictionSource ||
        "XGBoost-V2",

      modelVersion:
        raw.modelVersion ||
        "1.0.0",

      /* -------------------------
       * Financial Projection
       * ------------------------- */

      targetRetPeriod:
        primaryForecast.returnPeriod ||
        "N/A",

      predictedOutputTax:
        taxInRupees,

      predictedItcAvail:
        itcInRupees,

      predictedTaxableVal:
        taxInRupees,

      predictedItcRatio:
        taxInRupees > 0
          ? itcInRupees / taxInRupees
          : 0,

      nilReturn:
        rawTaxVal === 0 &&
        rawItcVal === 0,

      /* -------------------------
       * Risk
       * ------------------------- */

      primaryRiskFactor:
        raw.primaryRiskFactor ||
        "NONE_DETECTED",

      dueDate:
        raw.dueDate || "N/A",

      estimatedFilingDate:
        raw.estimatedFilingDate ||
        "N/A",

      delayDays:
        safeNumber(
          raw.delayDays
        ),

      calculatedLateFee:
        rawRupees(
          raw.calculatedLateFee
        ),

      calculatedDt:
        raw.calculatedDt ||
        new Date().toISOString()
    };

  } catch (err) {

    console.error(
      `Error fetching prediction for GSTIN ${gstin}:`,
      err.response?.data ||
      err.message
    );

    throw err;
  }
};


/* ============================================================
 * GSTIN ANALYSIS API
 * ============================================================ */

/**
 * Fetch:
 *
 * - GSTIN profile
 * - 6 month GSTR-3B history
 * - IGST
 * - CGST
 * - SGST
 * - CESS
 * - Output Tax
 * - ITC
 * - ITC Eligible
 * - Cash Paid
 * - RCM
 * - Filing Delay
 * - Filing Status
 * - Alerts
 */
