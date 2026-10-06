import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  BadgeIndianRupee,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Gavel,
  History,
  Loader2,
  Send,
  ShieldAlert,
  UserRound,
  X,
} from "lucide-react";

import { fetchDefaulterHistory } from "../services/defaulterDashboardService";

import { issueGstr3a } from "../services/defaulterProceedingService";

import "./GstDefaulterViewModal.css";

const INTEGER_FORMAT = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

const MONEY_FORMAT = new Intl.NumberFormat("en-IN", {
  style: "currency",

  currency: "INR",

  maximumFractionDigits: 0,
});

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",

  month: "2-digit",

  year: "numeric",
});

const toNumber = (value) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
};

const integer = (value) => INTEGER_FORMAT.format(toNumber(value));

const money = (value) => MONEY_FORMAT.format(toNumber(value));

const normalize = (value) =>
  String(value || "")
    .trim()

    .toUpperCase()

    .replaceAll("-", "_")

    .replaceAll(" ", "_");

const badgeClass = (value) =>
  normalize(value).toLowerCase().replaceAll("_", "-") || "neutral";

const humanize = (value) => {
  const normalized = normalize(value);

  if (!normalized) return "—";

  return normalized

    .toLowerCase()

    .replaceAll("_", " ")

    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const textValue = (value) =>
  value === null || value === undefined || value === "" ? "—" : String(value);

const yesNo = (value) => ["Y", "YES", "TRUE", "1"].includes(normalize(value));

const formatDate = (value) => {
  if (!value) return "—";

  const text = String(value);

  if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(text)) {
    return text;
  }

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);

  if (isoDate) {
    return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return DATE_FORMAT.format(date);
};

const formatPeriod = (period) => {
  const value = String(period || "").trim();

  if (!/^(0[1-9]|1[0-2])\d{4}$/.test(value)) {
    return value || "—";
  }

  const month = Number(value.substring(0, 2));

  const year = Number(value.substring(2));

  const monthName = new Date(year, month - 1, 1).toLocaleString("en-IN", {
    month: "long",
  });

  return `${value.substring(0, 2)}-${year} (${monthName} ${year})`;
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

/* =========================================================







   COMMON COMPONENTS







\\\\========================================================= */

function DetailRow({ label, value, children, className = "" }) {
  return (
    <div className={`gdm-detail-row ${className}`}>
      <span className="gdm-detail-label">{label}</span>

      <span className="gdm-detail-separator">:</span>

      <div className="gdm-detail-value">{children ?? textValue(value)}</div>
    </div>
  );
}

function StatusBadge({ value, type = "status" }) {
  return (
    <span className={`gdm-badge gdm-${type}-${badgeClass(value)}`}>
      {humanize(value)}
    </span>
  );
}

function YesNoBadge({ value, yesLabel = "Yes", noLabel = "No" }) {
  const active = typeof value === "boolean" ? value : yesNo(value);

  return (
    <span className={`gdm-yesno ${active ? "gdm-yes" : "gdm-no"}`}>
      {active ? yesLabel : noLabel}
    </span>
  );
}

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="gdm-section-header">
      {Icon && <Icon size={16} />}

      <h3>{title}</h3>
    </div>
  );
}

/* =========================================================







   MAIN MODAL







\\\\========================================================= */

export default function GstDefaulterViewModal({
  open,

  data,

  onClose,

  onGenerateNotice,

  onViewTrend,
  onSection62Review,
}) {
  const [activeTab, setActiveTab] = useState("summary");

  const [history, setHistory] = useState([]);

  const [historyLoading, setHistoryLoading] = useState(false);

  const [historyError, setHistoryError] = useState("");

  /* ---------------------------------------------------------







     NOTICE STATE







  --------------------------------------------------------- */

  const [noticeRemarks, setNoticeRemarks] = useState("");

  const [noticeSending, setNoticeSending] = useState(false);

  const [noticeError, setNoticeError] = useState("");

  const [noticeSuccess, setNoticeSuccess] = useState("");

  /* ---------------------------------------------------------







     RESET MODAL







  --------------------------------------------------------- */

  useEffect(() => {
    if (!open) return;

    setActiveTab("summary");

    setNoticeRemarks("");

    setNoticeError("");

    setNoticeSuccess("");
  }, [open, data?.gstin, data?.retPeriod]);

  /* ---------------------------------------------------------







     BODY SCROLL / ESCAPE







  --------------------------------------------------------- */

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !noticeSending) {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;

      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, noticeSending]);

  /* ---------------------------------------------------------







     RETURN HISTORY







  --------------------------------------------------------- */

  useEffect(() => {
    if (!open || !data?.gstin) {
      setHistory([]);

      setHistoryError("");

      return undefined;
    }

    const controller = new AbortController();

    const loadHistory = async () => {
      setHistoryLoading(true);

      setHistoryError("");

      try {
        const response = await fetchDefaulterHistory(data.gstin, {
          months: 12,

          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        const source = response?.data ?? response;

        if (Array.isArray(source)) {
          setHistory(source);
        } else if (Array.isArray(source?.content)) {
          setHistory(source.content);
        } else {
          setHistory([]);
        }
      } catch (error) {
        if (!isAbortError(error)) {
          setHistory([]);

          setHistoryError(apiError(error, "Unable to load return history."));
        }
      } finally {
        if (!controller.signal.aborted) {
          setHistoryLoading(false);
        }
      }
    };

    loadHistory();

    return () => controller.abort();
  }, [open, data?.gstin]);

  const latestHistory = useMemo(() => history.slice(0, 6), [history]);

  /* ---------------------------------------------------------







     DERIVED VALUES







  --------------------------------------------------------- */

  const filingStatus = normalize(data?.filingStatus);

  const defaultLevel = normalize(data?.defaultLevel);

  const riskLevel = normalize(data?.riskLevel);

  const proceedingStatus = normalize(data?.status || data?.proceedingStatus);

  const gstrIssued =
    normalize(data?.gstr3aStatus) === "ISSUED" || Boolean(data?.gstr3aRefNo);

  const gstrEligible = yesNo(data?.gstr3aEligible);

  const section62Eligible =
    yesNo(data?.section62Eligible) ||
    yesNo(data?.section62Candidate) ||
    proceedingStatus === "SECTION62_ELIGIBLE";

  const gstr3aDeadlineExpired = useMemo(() => {
    if (!data?.gstr3aDeadline) return false;

    const raw = String(data.gstr3aDeadline).trim();

    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);

    const deadline = iso
      ? new Date(
          Number(iso[1]),

          Number(iso[2]) - 1,

          Number(iso[3]),

          23,

          59,

          59,

          999,
        )
      : new Date(raw);

    return !Number.isNaN(deadline.getTime()) && deadline.getTime() < Date.now();
  }, [data?.gstr3aDeadline]);

  const showSection62Review =
    section62Eligible &&
    proceedingStatus === "SECTION62_ELIGIBLE" &&
    !data?.filingDate &&
    !data?.asmt13RefNo;

  const canSendGstr3a =
    gstrEligible &&
    !gstrIssued &&
    !section62Eligible &&
    proceedingStatus !== "SECTION62_ELIGIBLE" &&
    !data?.filingDate &&
    ["NOT_FILED", "RETURN_PENDING", "PENDING"].includes(filingStatus);

  const taxpayerName =
    data?.taxpayerName || data?.tradeName || data?.legalName || "—";

  const jurisdiction =
    data?.officeName || data?.stJuri || data?.jurisdiction || "—";

  /* ---------------------------------------------------------







     SEND GSTR-3A







  --------------------------------------------------------- */

  const handleSendGstr3a = useCallback(async () => {
    if (noticeSending) {
      return;
    }

    setNoticeError("");

    setNoticeSuccess("");

    if (!data?.gstin || !data?.retPeriod) {
      setNoticeError("GSTIN and return period are required.");

      return;
    }

    if (gstrIssued) {
      setNoticeError(
        "GSTR-3A notice has already been issued for this return period.",
      );

      return;
    }

    if (!canSendGstr3a) {
      setNoticeError(
        "This GSTIN and return period are not currently eligible for GSTR-3A issuance.",
      );

      return;
    }

    setNoticeSending(true);

    try {
      const response = await issueGstr3a({
        gstin: data.gstin,

        retPeriod: data.retPeriod,

        remarks: noticeRemarks.trim() || null,
      });

      const result = response?.data ?? response ?? {};

      setNoticeSuccess(
        result?.message || "GSTR-3A notice issued successfully.",
      );

      /*







       * Parent dashboard can reload







       * summary and table.







       */

      onGenerateNotice?.(result, data);
    } catch (error) {
      setNoticeError(apiError(error, "Unable to issue GSTR-3A notice."));
    } finally {
      setNoticeSending(false);
    }
  }, [
    data,

    gstrIssued,

    canSendGstr3a,

    noticeRemarks,

    noticeSending,

    onGenerateNotice,
  ]);

  /* ---------------------------------------------------------







     HISTORY TABLE







  --------------------------------------------------------- */

  const renderHistoryRows = (items, columns = 9) => {
    if (historyLoading) {
      return (
        <tr>
          <td colSpan={columns} className="gdm-empty">
            <Loader2 size={15} className="gdm-spin" /> Loading return history...
          </td>
        </tr>
      );
    }

    if (historyError) {
      return (
        <tr>
          <td colSpan={columns} className="gdm-empty gdm-empty-error">
            <AlertTriangle size={15} /> {historyError}
          </td>
        </tr>
      );
    }

    if (!items.length) {
      return (
        <tr>
          <td colSpan={columns} className="gdm-empty">
            No return history available.
          </td>
        </tr>
      );
    }

    return items.map((item, index) => (
      <tr key={`${item.gstin || data?.gstin}-${item.retPeriod || index}`}>
        {columns === 9 && <td>{index + 1}</td>}

        <td className="gdm-period-cell">{textValue(item.retPeriod)}</td>

        <td>{formatDate(item.dueDate)}</td>

        <td>{formatDate(item.filingDate)}</td>

        <td>
          <StatusBadge value={item.filingStatus} type="filing" />
        </td>

        <td className="gdm-number-cell">{integer(item.delayDays)}</td>

        <td className="gdm-history-money">{money(item.outputTax)}</td>

        {columns === 9 && (
          <>
            <td>
              <StatusBadge value={item.defaultLevel} type="default" />
            </td>

            <td>
              <StatusBadge value={item.riskLevel} type="risk" />
            </td>
          </>
        )}
      </tr>
    ));
  };

  if (!open || !data) {
    return null;
  }

  /* =========================================================







     SUMMARY TAB







  ========================================================= */

  const summaryTab = (
    <>
      <section className="gdm-section">
        <SectionHeader icon={UserRound} title="Basic Information" />

        <div className="gdm-section-body">
          <div className="gdm-details-grid">
            <DetailRow label="GSTIN" value={data.gstin} />

            <DetailRow label="Taxpayer Name" value={taxpayerName} />

            <DetailRow label="Trade Name" value={data.tradeName} />

            <DetailRow label="Constitution" value={data.constitution} />

            <DetailRow label="State" value={data.stateName || data.state} />

            <DetailRow label="Jurisdiction" value={jurisdiction} />

            <DetailRow
              label="Address"
              value={
                data.address || data.principalAddress || data.businessAddress
              }
              className="gdm-detail-wide"
            />
          </div>
        </div>
      </section>

      <div className="gdm-two-column">
        <section className="gdm-section">
          <SectionHeader icon={FileText} title="Return & Filing Details" />

          <div className="gdm-section-body">
            <DetailRow label="Return Period">
              {formatPeriod(data.retPeriod)}
            </DetailRow>

            <DetailRow label="Due Date">{formatDate(data.dueDate)}</DetailRow>

            <DetailRow label="Filing Status">
              <StatusBadge value={filingStatus} type="filing" />
            </DetailRow>

            <DetailRow label="Filing Date">
              {formatDate(data.filingDate)}
            </DetailRow>

            <DetailRow label="Delay (Days)" value={integer(data.delayDays)} />

            <DetailRow label="Output Tax">
              <strong className="gdm-money">{money(data.outputTax)}</strong>
            </DetailRow>

            <DetailRow label="Taxable Value">
              <strong className="gdm-money">{money(data.taxableValue)}</strong>
            </DetailRow>
          </div>
        </section>

        <section className="gdm-section">
          <SectionHeader icon={ShieldAlert} title="Risk & Default Assessment" />

          <div className="gdm-section-body">
            <DetailRow label="Default Score">
              <strong className="gdm-score">
                {toNumber(data.defaultScore ?? data.riskScore).toFixed(2)}
              </strong>
            </DetailRow>

            <DetailRow label="Default Level">
              <StatusBadge value={defaultLevel} type="default" />
            </DetailRow>

            <DetailRow label="Risk Level">
              <StatusBadge value={riskLevel} type="risk" />
            </DetailRow>

            <DetailRow label="GSTR-3A Status">
              {gstrIssued ? (
                <span className="gdm-gstr issued">Issued</span>
              ) : gstrEligible ? (
                <span className="gdm-gstr eligible">Eligible</span>
              ) : (
                <span className="gdm-neutral">Not Eligible</span>
              )}
            </DetailRow>

            <DetailRow label="Section 62 Candidate">
              <YesNoBadge value={section62Eligible} />
            </DetailRow>

            <DetailRow
              label="Officer Review"
              value={data.officerReviewStatus || "Pending"}
            />

            <DetailRow
              label="Growth Status"
              value={humanize(data.growthStatus)}
            />
          </div>
        </section>
      </div>

      <section className="gdm-section">
        <SectionHeader icon={History} title="Recent Return Filing History" />

        <div className="gdm-history-scroll">
          <table className="gdm-history-table">
            <thead>
              <tr>
                <th>Return Period</th>

                <th>Due Date</th>

                <th>Filing Date</th>

                <th>Status</th>

                <th>Delay (Days)</th>

                <th>Output Tax (₹)</th>
              </tr>
            </thead>

            <tbody>{renderHistoryRows(latestHistory, 6)}</tbody>
          </table>
        </div>
      </section>
    </>
  );

  /* =========================================================







     HISTORY TAB







  ========================================================= */

  const historyTab = (
    <section className="gdm-section">
      <SectionHeader icon={History} title="Return Filing History" />

      <div className="gdm-history-scroll">
        <table className="gdm-history-table gdm-history-large">
          <thead>
            <tr>
              <th>#</th>

              <th>Return Period</th>

              <th>Due Date</th>

              <th>Filing Date</th>

              <th>Filing Status</th>

              <th>Delay (Days)</th>

              <th>Output Tax (₹)</th>

              <th>Default Level</th>

              <th>Risk Level</th>
            </tr>
          </thead>

          <tbody>{renderHistoryRows(history, 9)}</tbody>
        </table>
      </div>
    </section>
  );

  /* =========================================================







     RISK TAB







  ========================================================= */

  const riskTab = (
    <div className="gdm-risk-grid">
      <article className="gdm-risk-card">
        <div className="gdm-risk-icon red">
          <ShieldAlert size={22} />
        </div>

        <span>Risk Level</span>

        <StatusBadge value={riskLevel} type="risk" />
      </article>

      <article className="gdm-risk-card">
        <div className="gdm-risk-icon orange">
          <AlertTriangle size={22} />
        </div>

        <span>Default Level</span>

        <StatusBadge value={defaultLevel} type="default" />
      </article>

      <article className="gdm-risk-card">
        <div className="gdm-risk-icon blue">
          <BadgeIndianRupee size={22} />
        </div>

        <span>Default Score</span>

        <strong>
          {toNumber(data.defaultScore ?? data.riskScore).toFixed(2)}
        </strong>
      </article>

      <article className="gdm-risk-card">
        <div className="gdm-risk-icon amber">
          <Clock3 size={22} />
        </div>

        <span>Filing Delay</span>

        <strong>{integer(data.delayDays)} Days</strong>
      </article>

      <article className="gdm-risk-card">
        <div className="gdm-risk-icon green">
          <CheckCircle2 size={22} />
        </div>

        <span>GSTR-3A</span>

        <strong>
          {gstrIssued ? "Issued" : gstrEligible ? "Eligible" : "Not Eligible"}
        </strong>
      </article>

      <article className="gdm-risk-card">
        <div className="gdm-risk-icon red">
          <Gavel size={22} />
        </div>

        <span>Section 62</span>

        <strong>{section62Eligible ? "Candidate" : "No"}</strong>
      </article>
    </div>
  );

  /* =========================================================







     ACTION TAB







  ========================================================= */

  const actionTab = (
    <div className="gdm-action-stack">
      <section className="gdm-section">
        <SectionHeader icon={Gavel} title="Statutory Actions" />

        <div className="gdm-action-list">
          <article className="gdm-action-item">
            <div>
              <strong>GSTR-3A Notice</strong>

              <p>
                Current eligibility and notice status for this GSTIN and return
                period.
              </p>
            </div>

            {gstrIssued ? (
              <span className="gdm-gstr issued">
                <CheckCircle2 size={14} />
                Issued
              </span>
            ) : canSendGstr3a ? (
              <span className="gdm-gstr eligible">Eligible</span>
            ) : gstrEligible ? (
              <span className="gdm-gstr eligible">
                Filing Status Recheck Required
              </span>
            ) : (
              <span className="gdm-neutral">Not Eligible</span>
            )}
          </article>

          <article className="gdm-action-item">
            <div>
              <strong>Section 62 Assessment</strong>

              <p>Assessment candidate status from the defaulter record.</p>
            </div>

            <YesNoBadge
              value={section62Eligible}
              yesLabel="Candidate"
              noLabel="No"
            />
          </article>

          <article className="gdm-action-item">
            <div>
              <strong>Officer Review</strong>

              <p>
                Current officer review status for this GSTIN and return period.
              </p>
            </div>

            <span className="gdm-review-status">
              {textValue(data.officerReviewStatus || "Pending")}
            </span>
          </article>
        </div>
      </section>

      {/* ===============================================







          INLINE GSTR-3A NOTICE ACTION







          NO SECOND POPUP / MODAL







      ================================================ */}

      <section className="gdm-section gdm-send-notice-section">
        <SectionHeader icon={Send} title="Send GSTR-3A Notice" />

        <div className="gdm-section-body">
          <div className="gdm-notice-inline-summary">
            <DetailRow label="GSTIN" value={data.gstin} />

            <DetailRow label="Taxpayer" value={taxpayerName} />

            <DetailRow label="Return Period">
              {formatPeriod(data.retPeriod)}
            </DetailRow>

            <DetailRow label="Due Date">{formatDate(data.dueDate)}</DetailRow>

            <DetailRow label="Filing Status">
              <StatusBadge value={filingStatus} type="filing" />
            </DetailRow>

            <DetailRow label="Delay (Days)" value={integer(data.delayDays)} />
          </div>

          {gstrIssued ? (
            <div className="gdm-notice-message success" role="status">
              <CheckCircle2 size={16} />

              <span>
                GSTR-3A notice has already been issued for this return period.
              </span>
            </div>
          ) : (
            <>
              <div className="gdm-notice-warning">
                <AlertTriangle size={18} />

                <span>
                  Filing status, statutory eligibility and officer jurisdiction
                  will be re-verified by the server immediately before the
                  notice is issued.
                </span>
              </div>

              <label
                className="gdm-notice-remarks"
                htmlFor="gdm-notice-remarks"
              >
                <span>Officer Remarks</span>

                <textarea
                  id="gdm-notice-remarks"
                  rows={4}
                  maxLength={1000}
                  value={noticeRemarks}
                  disabled={noticeSending || !canSendGstr3a}
                  placeholder={
                    canSendGstr3a
                      ? "Enter remarks for GSTR-3A issuance..."
                      : "Notice cannot be issued for the current filing/eligibility status."
                  }
                  onChange={(event) => setNoticeRemarks(event.target.value)}
                />

                <small>
                  {noticeRemarks.length}
                  /1000
                </small>
              </label>
            </>
          )}

          {noticeError && (
            <div className="gdm-notice-message error" role="alert">
              <AlertTriangle size={16} />

              <span>{noticeError}</span>
            </div>
          )}

          {noticeSuccess && (
            <div className="gdm-notice-message success" role="status">
              <CheckCircle2 size={16} />

              <span>{noticeSuccess}</span>
            </div>
          )}

          <div className="gdm-inline-notice-actions">
            {gstrIssued ? (
              <button type="button" className="gdm-primary-button" disabled>
                <CheckCircle2 size={15} />
                GSTR-3A Issued
              </button>
            ) : (
              <button
                type="button"
                className="gdm-primary-button"
                onClick={handleSendGstr3a}
                disabled={noticeSending || !canSendGstr3a}
              >
                {noticeSending ? (
                  <>
                    <Loader2 size={15} className="gdm-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    Send GSTR-3A Notice
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </section>

      {showSection62Review && (
        <section className="gdm-section gdm-section62-review">
          <SectionHeader
            icon={Gavel}
            title="Section 62 — Best Judgment Assessment Review"
          />

          <div className="gdm-section-body">
            <div className="gdm-section62-alert" role="status">
              <ShieldAlert size={20} />

              <div>
                <strong>Officer Review Required</strong>

                <p>
                  The GSTR-3A compliance period has expired and GSTR-3B remains
                  unfiled. The proceeding is eligible for proper-officer review
                  under Section 62.
                </p>
              </div>
            </div>

            <div className="gdm-notice-inline-summary">
              <DetailRow label="GSTIN" value={data.gstin} />

              <DetailRow label="Taxpayer" value={taxpayerName} />

              <DetailRow label="Return Period">
                {formatPeriod(data.retPeriod)}
              </DetailRow>

              <DetailRow label="Due Date">{formatDate(data.dueDate)}</DetailRow>

              <DetailRow label="GSTR-3A Reference">
                {textValue(data.gstr3aRefNo)}
              </DetailRow>

              <DetailRow label="GSTR-3A Issue Date">
                {formatDate(data.gstr3aIssueDate)}
              </DetailRow>

              <DetailRow label="GSTR-3A Service Date">
                {formatDate(data.gstr3aServiceDate)}
              </DetailRow>

              <DetailRow label="GSTR-3A Deadline">
                <strong
                  className={
                    gstr3aDeadlineExpired ? "gdm-deadline-expired" : ""
                  }
                >
                  {formatDate(data.gstr3aDeadline)}

                  {gstr3aDeadlineExpired ? " · Expired" : ""}
                </strong>
              </DetailRow>

              <DetailRow label="Current Return Status">
                <StatusBadge value={filingStatus} type="filing" />
              </DetailRow>

              <DetailRow label="Proceeding Status">
                <StatusBadge value={proceedingStatus} type="status" />
              </DetailRow>

              <DetailRow label="Section 62">
                <span className="gdm-section62-badge">Eligible</span>
              </DetailRow>
            </div>

            <div className="gdm-section62-warning">
              <AlertTriangle size={18} />

              <span>
                ASMT-13 is not generated automatically. The proper officer must
                review the available material and determine the best-judgment
                assessment before the assessment-order action is enabled.
              </span>
            </div>

            <div className="gdm-inline-notice-actions">
              <button
                type="button"
                className="gdm-primary-button"
                onClick={() => onSection62Review?.(data)}
                disabled={!onSection62Review}
              >
                <Gavel size={16} />
                Review for Section 62
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );

  /* =========================================================







     COMPLIANCE TAB







  ========================================================= */

  const complianceTab = (
    <div className="gdm-two-column">
      <section className="gdm-section">
        <SectionHeader icon={CalendarDays} title="Compliance" />

        <div className="gdm-section-body">
          <DetailRow label="Return Period">
            {formatPeriod(data.retPeriod)}
          </DetailRow>

          <DetailRow label="Filing Status">
            <StatusBadge value={filingStatus} type="filing" />
          </DetailRow>

          <DetailRow label="Delay Days" value={integer(data.delayDays)} />

          <DetailRow
            label="Growth Status"
            value={humanize(data.growthStatus)}
          />

          <DetailRow
            label="GSTR-3A"
            value={
              gstrIssued ? "Issued" : gstrEligible ? "Eligible" : "Not Eligible"
            }
          />
        </div>
      </section>

      <section className="gdm-section">
        <SectionHeader icon={Building2} title="Jurisdiction" />

        <div className="gdm-section-body">
          <DetailRow label="Office" value={jurisdiction} />

          <DetailRow label="State" value={data.stateName || data.state} />

          <DetailRow label="Jurisdiction Code" value={data.stJuri} />

          <DetailRow
            label="Address"
            value={data.address || data.principalAddress}
          />
        </div>
      </section>
    </div>
  );

  /* =========================================================







     MODAL







  ========================================================= */

  return (
    <div className="gdm-backdrop" role="presentation">
      <section
        className="gdm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gdm-title"
      >
        <header className="gdm-header">
          <div>
            <h2 id="gdm-title">Defaulter Details</h2>

            <p>
              {data.gstin || "—"}

              {taxpayerName !== "—" ? ` · ${taxpayerName}` : ""}
            </p>
          </div>

          <button
            type="button"
            className="gdm-close-icon"
            onClick={onClose}
            disabled={noticeSending}
            aria-label="Close defaulter details"
          >
            <X size={20} />
          </button>
        </header>

        {/* TABS */}

        <nav className="gdm-tabs" aria-label="Defaulter details">
          {[
            ["summary", "Summary"],

            ["history", "Return History"],

            ["risk", "Risk Analysis"],

            ["actions", "Actions"],

            ["compliance", "Compliance"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={activeTab === key ? "active" : ""}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* CONTENT */}

        <div className="gdm-content">
          {activeTab === "summary" && summaryTab}

          {activeTab === "history" && historyTab}

          {activeTab === "risk" && riskTab}

          {activeTab === "actions" && actionTab}

          {activeTab === "compliance" && complianceTab}
        </div>

        {/* FOOTER */}

        <footer className="gdm-footer">
          <div className="gdm-footer-actions">
            {onViewTrend && (
              <button
                type="button"
                className="gdm-secondary-button"
                onClick={() => onViewTrend(data)}
              >
                <History size={15} />
                View Return Trend
              </button>
            )}
          </div>

          <button
            type="button"
            className="gdm-close-button"
            onClick={onClose}
            disabled={noticeSending}
          >
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}
