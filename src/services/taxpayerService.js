import { apiClient as dashboardClient } from "./apiClient";

/* ============================================================
 * CONSTANTS
 * ============================================================ */

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PERIOD_REGEX = /^(0[1-9]|1[0-2])\d{4}$/;

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/* ============================================================
 * HELPERS
 * ============================================================ */

/** Safely converts API values to JavaScript numbers. */
const safeNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

/**
 * Backend GST monetary values are already INR
 * (739039.68 stays 739039.68). Never scale them here.
 */
const rawRupees = (value) => safeNumber(value, 0);

const hasValue = (value) => value !== null && value !== undefined;

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeGstin = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

const isCancelled = (err, signal) =>
  err?.name === "CanceledError" ||
  err?.name === "AbortError" ||
  err?.code === "ERR_CANCELED" ||
  Boolean(signal?.aborted);

/** Decimal ratio, e.g. 500 / 1000 = 0.5 (UI renders it as 50%). */
const calculateRatio = (numerator, denominator) => {
  const n = safeNumber(numerator);
  const d = safeNumber(denominator);

  return d <= 0 ? 0 : n / d;
};

/** API ratio when present, otherwise calculated from amounts. */
const ratioOrCalculated = (apiValue, numerator, denominator) => {
  if (hasValue(apiValue)) {
    return safeNumber(apiValue);
  }

  return denominator > 0 ? calculateRatio(numerator, denominator) : 0;
};

/** API count when present, otherwise the fallback derived from history. */
const countOrFallback = (apiValue, fallback) =>
  hasValue(apiValue) ? safeNumber(apiValue) : fallback;

/** 032026 -> Mar 2026 */
const formatPeriodLabel = (retPeriod) => {
  const value = String(retPeriod || "").trim();

  if (!PERIOD_REGEX.test(value)) {
    return value;
  }

  const month = Number(value.substring(0, 2));

  return `${MONTH_LABELS[month - 1]} ${value.substring(2)}`;
};

/** Preserves the backend status; derives one only when it is missing. */
const determineFilingStatus = (filingStatus, filingDelayDays) => {
  const status = String(filingStatus || "")
    .trim()
    .toUpperCase();

  if (status) {
    return status;
  }

  return safeNumber(filingDelayDays) > 0 ? "DELAYED" : "FILED";
};

/**
 * Supports:
 * response.data / response.data.data / response.data.result /
 * response.data.payload
 */
const unwrapPayload = (payload) => {
  if (isPlainObject(payload?.data)) return payload.data;
  if (isPlainObject(payload?.result)) return payload.result;
  if (isPlainObject(payload?.payload)) return payload.payload;

  return payload;
};

const sumField = (rows, field) =>
  rows.reduce((sum, item) => sum + safeNumber(item?.[field]), 0);

/* ============================================================
 * NORMALIZERS
 * ============================================================ */

const normalizeHistoryItem = (item) => {
  const outputTax = rawRupees(item.outputTax);
  const itcClaimed = rawRupees(item.itcClaimed);
  const cashPaid = rawRupees(item.cashPaid);
  const filingDelayDays = safeNumber(item.filingDelayDays);

  return {
    retPeriod: item.retPeriod || "",
    formattedPeriod: item.formattedPeriod || formatPeriodLabel(item.retPeriod),

    taxableValue: rawRupees(item.taxableValue),

    igst: rawRupees(item.igst),
    cgst: rawRupees(item.cgst),
    sgst: rawRupees(item.sgst),
    cess: rawRupees(item.cess),

    outputTax,

    itcClaimed,
    itcEligible: rawRupees(item.itcEligible),

    cashPaid,
    rcmTax: rawRupees(item.rcmTax),

    itcRatio: ratioOrCalculated(item.itcRatio, itcClaimed, outputTax),
    cashRatio: ratioOrCalculated(item.cashRatio, cashPaid, outputTax),

    filingDelayDays,
    filingStatus: determineFilingStatus(item.filingStatus, filingDelayDays),
  };
};

const normalizeAlert = (alert, cleanGstin) => ({
  id: alert.id || "",
  gstin: alert.gstin || cleanGstin,
  retPeriod: alert.retPeriod || "",
  message: alert.message || "",
  excessItc: rawRupees(alert.excessItc),
  severity: alert.severity || "LOW",
  formattedDate: alert.formattedDate || "",
  riskLevel: alert.riskLevel || "",
  compositeScore: hasValue(alert.compositeScore)
    ? safeNumber(alert.compositeScore)
    : null,
  findingCode: alert.findingCode || "",
  category: alert.category || "",
  legalBasis: alert.legalBasis || "",
  evidenceValue: rawRupees(alert.evidenceValue),
  assessmentId: alert.assessmentId ?? null,
  createdAt: alert.createdAt ?? null,
});

/* ============================================================
 * API
 * ============================================================ */

export const fetchGstinAnalysis = async (gstin, signal) => {
  try {
    /* ---------------- GSTIN VALIDATION ---------------- */

    const cleanGstin = normalizeGstin(gstin);

    if (!cleanGstin) {
      throw new Error("GSTIN parameter is required");
    }

    if (!GSTIN_REGEX.test(cleanGstin)) {
      throw new Error("Invalid GSTIN format");
    }

    /* ---------------- API REQUEST ---------------- */

    const response = await dashboardClient.get(
      `/gst/return-3b/analytics/${encodeURIComponent(cleanGstin)}`,
      { signal },
    );

    const raw = unwrapPayload(response ?? {});

    if (!isPlainObject(raw)) {
      throw new Error("Invalid GSTIN analysis response received from server");
    }

    /* ---------------- MONTHLY HISTORY ---------------- */

    const normalizedHistory = Array.isArray(raw.last6MonthsHistory)
      ? raw.last6MonthsHistory.filter(Boolean).map(normalizeHistoryItem)
      : [];

    /* ---------------- AUTHORITATIVE LIFETIME VALUES ----------------
     * Backend DTO contains both lifetaxableValue (typo) and
     * lifetimeTaxableValue. Prefer lifetimeTaxableValue.
     * ------------------------------------------------------------ */

    const lifetimeTaxableValue = rawRupees(
      raw.lifetimeTaxableValue ?? raw.lifetaxableValue,
    );
    const lifetimeOutputTax = rawRupees(raw.lifetimeOutputTax);
    const lifetimeIgst = rawRupees(raw.lifetimeIgst);
    const lifetimeCgst = rawRupees(raw.lifetimeCgst);
    const lifetimeSgst = rawRupees(raw.lifetimeSgst);
    const lifetimeCess = rawRupees(raw.lifetimeCess);
    const lifetimeRcmTax = rawRupees(raw.lifetimeRcmTax);
    const lifetimeExcessItc = rawRupees(raw.lifetimeExcessItc);
    const lifetimeCashPaid = rawRupees(raw.lifetimeCashPaid);
    const lifetimeItcUtilized = rawRupees(raw.lifetimeItcUtilized);
    const lifetimeItcEligible = rawRupees(raw.lifetimeItcEligible);

    /* ---------------- RATIOS (decimal: 0.50 = 50%) ---------------- */

    const cashPaymentRatio = ratioOrCalculated(
      raw.cashPaymentRatio,
      lifetimeCashPaid,
      lifetimeOutputTax,
    );

    const itcUtilizationRatio = ratioOrCalculated(
      raw.itcUtilizationRatio,
      lifetimeItcUtilized,
      lifetimeOutputTax,
    );

    /* ---------------- RETURN COUNTS ----------------
     * Backend returns null for some taxpayers; fall back to the
     * available six-month history.
     * ------------------------------------------------ */

    const calculatedDelayedReturns = normalizedHistory.filter(
      (item) =>
        item.filingStatus === "DELAYED" || safeNumber(item.filingDelayDays) > 0,
    ).length;

    const calculatedPendingReturns = normalizedHistory.filter(
      (item) => item.filingStatus === "PENDING",
    ).length;

    const calculatedFiledReturns = normalizedHistory.filter(
      (item) => item.filingStatus === "FILED" || item.filingStatus === "DELAYED",
    ).length;

    const calculatedMaxDelay = normalizedHistory.reduce(
      (max, item) => Math.max(max, safeNumber(item.filingDelayDays)),
      0,
    );

    /* ---------------- SIX-MONTH TOTALS ---------------- */

    const historyITCClaimed = sumField(normalizedHistory, "itcClaimed");

    /* ---------------- FINAL NORMALIZED RESPONSE ---------------- */

    return {
      /* Taxpayer profile */
      gstin: raw.gstin || cleanGstin,
      legalName: raw.legalName || "Taxpayer Legal Name Unspecified",
      tradeName: raw.tradeName || "",
      pan: raw.pan || "",
      jurisdiction: raw.jurisdiction || "N/A",
      taxpayerType: raw.taxpayerType || "REGULAR",
      /* Actual backend status (sample API uses "A"). */
      status: raw.status || "",

      /* Lifetime values */
      lifetimeOutputTax,
      /* Temporary compatibility with the backend typo. */
      lifetaxableValue: lifetimeTaxableValue,
      lifetimeTaxableValue,
      lifetimeIgst,
      lifetimeCgst,
      lifetimeSgst,
      lifetimeCess,
      lifetimeRcmTax,
      lifetimeExcessItc,
      lifetimeCashPaid,
      lifetimeItcUtilized,
      lifetimeItcEligible,

      /* Compliance ratios */
      itcUtilizationRatio,
      cashPaymentRatio,

      /* Return statistics */
      totalReturns: countOrFallback(raw.totalReturns, normalizedHistory.length),
      delayedReturns: countOrFallback(
        raw.delayedReturns,
        calculatedDelayedReturns,
      ),
      pendingReturns: countOrFallback(
        raw.pendingReturns,
        calculatedPendingReturns,
      ),
      filedReturns: countOrFallback(raw.filedReturns, calculatedFiledReturns),
      maxFilingDelayDays: countOrFallback(
        raw.maxFilingDelayDays,
        calculatedMaxDelay,
      ),

      /* Risk */
      currentRiskScore: safeNumber(raw.currentRiskScore),
      riskCategory: raw.riskCategory || "LOW",

      /* Monthly history */
      last6MonthsHistory: normalizedHistory,

      /* Authoritative dashboard totals (lifetime, not six-month sums) */
      totalTaxableValue: lifetimeTaxableValue,
      totalIGST: lifetimeIgst,
      totalCGST: lifetimeCgst,
      totalSGST: lifetimeSgst,
      totalCESS: lifetimeCess,
      totalOutputTax: lifetimeOutputTax,
      /* DTO has no lifetimeItcClaimed: derived from monthly history. */
      totalITCClaimed: historyITCClaimed,
      totalITCUtilized: lifetimeItcUtilized,
      totalITCEligible: lifetimeItcEligible,
      totalCashPaid: lifetimeCashPaid,
      totalRCMTax: lifetimeRcmTax,
      totalExcessItc: lifetimeExcessItc,

      /* Six-month totals, kept separate from lifetime values */
      historyTotals: {
        taxableValue: sumField(normalizedHistory, "taxableValue"),
        igst: sumField(normalizedHistory, "igst"),
        cgst: sumField(normalizedHistory, "cgst"),
        sgst: sumField(normalizedHistory, "sgst"),
        cess: sumField(normalizedHistory, "cess"),
        outputTax: sumField(normalizedHistory, "outputTax"),
        itcClaimed: historyITCClaimed,
        itcEligible: sumField(normalizedHistory, "itcEligible"),
        cashPaid: sumField(normalizedHistory, "cashPaid"),
        rcmTax: sumField(normalizedHistory, "rcmTax"),
      },

      /* Alerts */
      activeAlerts: Array.isArray(raw.activeAlerts)
        ? raw.activeAlerts
            .filter(Boolean)
            .map((alert) => normalizeAlert(alert, cleanGstin))
        : [],
    };
  } catch (err) {
    if (!isCancelled(err, signal)) {
      console.error(
        `Error fetching GSTIN analysis for ${gstin}:`,
        err?.response?.data || err?.message || err,
      );
    }

    throw err;
  }
};
