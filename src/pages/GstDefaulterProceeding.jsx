import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  Filter,
  Gavel,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";

import {
  apiMessage,
  fetchProceedingSummary,
  fetchProceedings,
  isAbortError,
  issueAsmt13,
  issueGstr3a,
  reconcileProceeding,
  scanSection62,
} from "../services/defaulterProceedingService";

import Gstr3aIssueModal from "../components/Gstr3aIssueModal";

import Asmt13AssessmentModal from "../components/Asmt13AssessmentModal";

import ProceedingDetailDrawer from "../components/ProceedingDetailDrawer";

import "./GstDefaulterProceeding.css";

const EMPTY_PAGE = { content: [], totalElements: 0, totalPages: 0 };

const PAGE_SIZES = [10, 25, 50, 100];

const norm = (v) =>
  String(v || "")
    .trim()

    .toUpperCase();

const pretty = (v) =>
  String(v || "—")
    .replaceAll("_", " ")

    .toLowerCase()

    .replace(/\b\w/g, (c) => c.toUpperCase());

const count = (v) => Math.max(0, Number(v) || 0);

const formatDate = (v) => {
  if (!v) return "—";

  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));

  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
};

const formatPeriod = (value) => {
  const text = String(value || "").trim();

  if (!/^(0[1-9]|1[0-2])\d{4}$/.test(text)) return text || "—";

  const month = Number(text.slice(0, 2));

  const year = text.slice(2);

  const monthName = new Intl.DateTimeFormat("en-IN", { month: "long" }).format(
    new Date(2000, month - 1, 1),
  );

  return `${monthName} ${year}`;
};

const formatMoney = (value) => {
  const amount = Number(value);

  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",

    currency: "INR",

    maximumFractionDigits: 0,
  }).format(amount);
};

const isYes = (value) =>
  value === true ||
  String(value || "")
    .trim()
    .toUpperCase() === "Y";

const isDeadlineOver = (value) => {
  if (!value) return false;

  const deadline = new Date(`${String(value).slice(0, 10)}T23:59:59`);

  return !Number.isNaN(deadline.getTime()) && deadline.getTime() < Date.now();
};

function Kpi({ title, value, subtitle, icon: Icon, tone }) {
  return (
    <article className={`proc-kpi proc-kpi-${tone}`}>
      <div>
        <span>{title}</span>

        <strong>{count(value).toLocaleString("en-IN")}</strong>

        <small>{subtitle}</small>
      </div>

      <i>
        <Icon size={22} />
      </i>
    </article>
  );
}

function Status({ value }) {
  const key = norm(value).toLowerCase().replaceAll("_", "-");

  return (
    <span className={`proc-status proc-status-${key || "unknown"}`}>
      {pretty(value)}
    </span>
  );
}

export default function GstDefaulterProceeding() {
  const [status, setStatus] = useState("");

  const [period, setPeriod] = useState("");

  const [searchText, setSearchText] = useState("");

  const [search, setSearch] = useState("");

  const [page, setPage] = useState(0);

  const [size, setSize] = useState(25);

  const [data, setData] = useState(EMPTY_PAGE);

  const [summary, setSummary] = useState({});

  const [loading, setLoading] = useState(false);

  const [summaryLoading, setSummaryLoading] = useState(false);

  const [mutationBusy, setMutationBusy] = useState(false);

  const [scanBusy, setScanBusy] = useState(false);

  const [error, setError] = useState("");

  const [actionError, setActionError] = useState("");

  const [success, setSuccess] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);

  const [selected, setSelected] = useState(null);

  const [detailOpen, setDetailOpen] = useState(false);

  const [gstr3aOpen, setGstr3aOpen] = useState(false);

  const [asmt13Open, setAsmt13Open] = useState(false);

  const filters = useMemo(
    () => ({
      ...(period ? { retPeriod: period } : {}),

      ...(status ? { status } : {}),

      ...(search ? { search } : {}),
    }),

    [period, status, search],
  );

  const listParams = useMemo(
    () => ({ ...filters, page, size }),

    [filters, page, size],
  );

  const refresh = useCallback(() => {
    setSuccess("");

    setRefreshKey((v) => v + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    setSummaryLoading(true);

    fetchProceedingSummary(filters, { signal: controller.signal })
      .then((r) => {
        if (!controller.signal.aborted) setSummary(r || {});
      })

      .catch((e) => {
        if (!isAbortError(e))
          setError(apiMessage(e, "Unable to load proceeding summary."));
      })

      .finally(() => {
        if (!controller.signal.aborted) setSummaryLoading(false);
      });

    return () => controller.abort();
  }, [filters, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);

    setError("");

    fetchProceedings(listParams, { signal: controller.signal })
      .then((r) => {
        if (controller.signal.aborted) return;

        setData({
          content: Array.isArray(r?.content) ? r.content : [],

          totalElements: count(r?.totalElements ?? r?.total),

          totalPages: count(r?.totalPages),
        });
      })

      .catch((e) => {
        if (!isAbortError(e))
          setError(apiMessage(e, "Unable to load proceedings."));
      })

      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [listParams, refreshKey]);

  useEffect(() => {
    if (data.totalPages > 0 && page >= data.totalPages)
      setPage(data.totalPages - 1);
  }, [data.totalPages, page]);

  const submitSearch = (event) => {
    event?.preventDefault?.();

    setSearch(searchText.trim());

    setPage(0);
  };

  const openGstr3a = (row) => {
    setSelected(row);

    setActionError("");

    setGstr3aOpen(true);
  };

  const openAsmt13 = (row) => {
    setSelected(row);

    setActionError("");

    setAsmt13Open(true);
  };

  const handleGstr3a = async (payload) => {
    setMutationBusy(true);

    setActionError("");

    try {
      const result = await issueGstr3a(payload);

      setGstr3aOpen(false);

      setSuccess(
        `GSTR-3A issued successfully${result?.referenceNo ? `: ${result.referenceNo}` : "."}`,
      );

      refresh();
    } catch (e) {
      setActionError(apiMessage(e, "Unable to issue GSTR-3A."));
    } finally {
      setMutationBusy(false);
    }
  };

  const handleAsmt13 = async (payload) => {
    setMutationBusy(true);

    setActionError("");

    try {
      const result = await issueAsmt13(payload);

      setAsmt13Open(false);

      setSuccess(
        `ASMT-13 issued successfully${result?.referenceNo ? `: ${result.referenceNo}` : "."}`,
      );

      refresh();
    } catch (e) {
      setActionError(apiMessage(e, "Unable to issue ASMT-13."));
    } finally {
      setMutationBusy(false);
    }
  };

  const handleReconcile = async (row) => {
    if (
      !window.confirm(`Re-check filing compliance for proceeding #${row.id}?`)
    )
      return;

    setMutationBusy(true);

    setError("");

    try {
      const result = await reconcileProceeding(row.id);

      setSuccess(
        result?.withdrawn
          ? `Proceeding #${row.id} reconciled and assessment marked deemed withdrawn.`
          : `Reconciliation completed: ${pretty(result?.reason)}`,
      );

      refresh();
    } catch (e) {
      setError(apiMessage(e, "Reconciliation failed."));
    } finally {
      setMutationBusy(false);
    }
  };

  const handleScan = async () => {
    if (
      !window.confirm(
        "Run Section 62 eligibility scan now? This does not issue ASMT-13.",
      )
    )
      return;

    setScanBusy(true);

    setError("");

    try {
      const r = await scanSection62();

      setSuccess(
        `Section 62 scan complete: ${count(r?.section62Eligible)} eligible, ${count(r?.complied)} complied.`,
      );

      refresh();
    } catch (e) {
      setError(apiMessage(e, "Section 62 scan failed."));
    } finally {
      setScanBusy(false);
    }
  };

  const records = data.content;

  const totalPages = data.totalPages;

  return (
    <main className="proc-page">
      {error && (
        <div className="proc-alert proc-alert-error">
          <AlertTriangle size={17} />

          {error}
        </div>
      )}

      {success && (
        <div className="proc-alert proc-alert-success">
          <CheckCircle2 size={17} />

          {success}
        </div>
      )}

      <section className="proc-filter-card">
        <div className="proc-filter-topline">
          <div className="proc-filter-title">
            <div className="proc-filter-title-icon" aria-hidden="true">
              <Filter size={18} />
            </div>

            <div>
              <h2>Statutory Proceeding Queue</h2>

              <p>
                GSTR-3A compliance, Section 62 eligibility, ASMT-13 assessment
                and post-assessment monitoring
              </p>
            </div>
          </div>

          <div className="proc-filter-meta">
            <div className="proc-filter-period">
              <CalendarDays size={14} />

              <span>
                Return Period:
                <strong>
                  {period ? ` ${formatPeriod(period)}` : " All Periods"}
                </strong>
              </span>
            </div>
          </div>
        </div>

        <form className="proc-filter-grid" onSubmit={submitSearch}>
          <label>
            <span>Return Period</span>

            <input
              value={period}
              maxLength={6}
              inputMode="numeric"
              placeholder="MMYYYY"
              onChange={(e) => {
                setPeriod(e.target.value.replace(/\D/g, "").slice(0, 6));

                setPage(0);
              }}
            />
          </label>

          <label>
            <span>Proceeding Status</span>

            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);

                setPage(0);
              }}
            >
              <option value="">All Statuses</option>

              <option value="GSTR3A_ELIGIBLE">GSTR-3A Eligible</option>

              <option value="GSTR3A_COMPLIANCE_PENDING">
                3A Compliance Pending
              </option>

              <option value="COMPLIED_AFTER_GSTR3A">Complied After 3A</option>

              <option value="SECTION62_ELIGIBLE">Section 62 Eligible</option>

              <option value="ASMT13_ISSUED">ASMT-13 Issued</option>

              <option value="ASMT13_DEEMED_WITHDRAWN">
                ASMT-13 Deemed Withdrawn
              </option>

              <option value="ASMT13_FINAL">ASMT-13 Final</option>
            </select>
          </label>

          <label className="proc-search-field">
            <span>GSTIN / Reference</span>

            <div>
              <Search size={16} />

              <input
                value={searchText}
                maxLength={100}
                placeholder="Search GSTIN or proceeding reference"
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
          </label>

          <button
            className="proc-btn proc-btn-primary proc-filter-search-btn"
            type="submit"
          >
            <Search size={16} /> Search
          </button>
        </form>
      </section>

      <section className="proc-kpi-grid" aria-busy={summaryLoading}>
        <Kpi
          title="Open Proceedings"
          value={summary.openProceedings ?? summary.total}
          subtitle="Current statutory workload"
          icon={Users}
          tone="blue"
        />

        <Kpi
          title="GSTR-3A Eligible"
          value={summary.gstr3aEligible}
          subtitle="Awaiting officer action"
          icon={FileText}
          tone="amber"
        />

        <Kpi
          title="3A Compliance Pending"
          value={summary.gstr3aCompliancePending}
          subtitle="Within notice compliance window"
          icon={Clock3}
          tone="orange"
        />

        <Kpi
          title="Section 62 Eligible"
          value={summary.section62Eligible}
          subtitle="Officer assessment review"
          icon={ShieldAlert}
          tone="red"
        />

        <Kpi
          title="ASMT-13 Issued"
          value={summary.asmt13Issued}
          subtitle="Assessment orders issued"
          icon={Gavel}
          tone="navy"
        />
      </section>

      <section className="proc-table-card">
        <div className="proc-table-toolbar">
          <div>
            <h2>GST 3B Defaulter Statutory Proceedings</h2>

            <p>
              {count(data.totalElements).toLocaleString("en-IN")} proceeding
              records
            </p>
          </div>

          <label>
            Rows
            <select
              value={size}
              onChange={(e) => {
                setSize(Number(e.target.value));
                setPage(0);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="proc-table-scroll">
          <table className="proc-proceeding-table">
            <thead>
              <tr>
                <th>#</th>
                <th>GSTIN / Period</th>
                <th>Office / Jurisdiction</th>

                <th>Return Compliance</th>
                <th>Proceeding Status</th>

                <th>GSTR-3A Proceeding</th>
                <th>Section 62</th>

                <th>ASMT-13 Assessment</th>
                <th>Assessed Total</th>
                <th>Officer Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="10" className="proc-empty">
                    <Loader2 size={18} className="proc-spin" /> Loading
                    proceedings...
                  </td>
                </tr>
              ) : !records.length ? (
                <tr>
                  <td colSpan="10" className="proc-empty">
                    No proceedings found for the selected filters.
                  </td>
                </tr>
              ) : (
                records.map((row, index) => {
                  const s = norm(row.status);

                  const asmt13Status = norm(row.asmt13Status);

                  const gstr3aIssued = Boolean(row.gstr3aRefNo);

                  const deadlineOver =
                    gstr3aIssued &&
                    isDeadlineOver(row.gstr3aDeadline) &&
                    !row.filingDate;

                  const section62Eligible =
                    isYes(row.section62Eligible) || s === "SECTION62_ELIGIBLE";

                  const can3a =
                    s === "GSTR3A_ELIGIBLE" && !gstr3aIssued && !row.filingDate;

                  const canAsmt =
                    section62Eligible &&
                    s === "SECTION62_ELIGIBLE" &&
                    !row.asmt13RefNo &&
                    !row.filingDate;

                  const canReconcile =
                    s === "ASMT13_ISSUED" || asmt13Status === "ISSUED";

                  return (
                    <tr key={row.id ?? `${row.gstin}-${row.retPeriod}`}>
                      <td>{page * size + index + 1}</td>

                      <td>
                        <strong className="proc-gstin">{row.gstin}</strong>

                        <small>
                          {formatPeriod(row.retPeriod)} ·{" "}
                          {row.returnType || "GSTR-3B"}
                        </small>

                        <small>
                          {row.filingFrequency || "MONTHLY"} ·{" "}
                          {row.taxpayerCategory || "REGULAR"}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {row.officeName || row.officeCode || "—"}
                        </strong>

                        <small>
                          {row.stJuri
                            ? `Jurisdiction: ${row.stJuri}`
                            : "Jurisdiction —"}
                        </small>
                      </td>

                      <td>
                        <div className="proc-cell-stack">
                          <span>
                            Due: <strong>{formatDate(row.dueDate)}</strong>
                          </span>

                          <span>
                            Filed: <strong>{formatDate(row.filingDate)}</strong>
                          </span>
                        </div>
                      </td>

                      <td>
                        <Status value={row.status} />

                        {deadlineOver && !section62Eligible && (
                          <small className="proc-attention">
                            3A deadline over · Section 62 review pending
                          </small>
                        )}
                      </td>

                      <td>
                        {gstr3aIssued ? (
                          <div className="proc-cell-stack">
                            <strong className="proc-ref">
                              {row.gstr3aRefNo}
                            </strong>

                            <span>
                              Issued: {formatDate(row.gstr3aIssueDate)}
                            </span>

                            <span>
                              Served: {formatDate(row.gstr3aServiceDate)}
                            </span>

                            <span
                              className={
                                deadlineOver ? "proc-deadline-over" : undefined
                              }
                            >
                              Deadline: {formatDate(row.gstr3aDeadline)}
                            </span>

                            {row.gstr3aStatus && (
                              <Status value={row.gstr3aStatus} />
                            )}
                          </div>
                        ) : (
                          <span className="proc-no">Not Issued</span>
                        )}
                      </td>

                      <td>
                        <div className="proc-cell-stack">
                          <span
                            className={
                              section62Eligible ? "proc-yes" : "proc-no"
                            }
                          >
                            {section62Eligible
                              ? "Eligible"
                              : deadlineOver
                                ? "Review Pending"
                                : "Not Eligible"}
                          </span>

                          {row.section62EligibleDate && (
                            <small>
                              Since: {formatDate(row.section62EligibleDate)}
                            </small>
                          )}

                          {section62Eligible && !row.asmt13RefNo && (
                            <small className="proc-manual-step">
                              Manual officer assessment review
                            </small>
                          )}
                        </div>
                      </td>

                      <td>
                        {row.asmt13RefNo ? (
                          <div className="proc-cell-stack">
                            <strong className="proc-ref">
                              {row.asmt13RefNo}
                            </strong>

                            <span>
                              Order: {formatDate(row.asmt13OrderDate)}
                            </span>

                            <span>
                              Served: {formatDate(row.asmt13ServiceDate)}
                            </span>

                            {row.asmt13Status && (
                              <Status value={row.asmt13Status} />
                            )}
                          </div>
                        ) : (
                          <span className="proc-no">Not Issued</span>
                        )}
                      </td>

                      <td className="proc-money-cell">
                        <strong>{formatMoney(row.assessedTotal)}</strong>

                        {row.asmt13RefNo && (
                          <small>
                            Tax {formatMoney(row.assessedTax)}
                            <br />
                            Interest {formatMoney(row.assessedInterest)}
                          </small>
                        )}
                      </td>

                      <td>
                        <div className="proc-row-actions">
                          <button
                            type="button"
                            title="View complete proceeding"
                            onClick={() => {
                              setSelected(row);
                              setDetailOpen(true);
                            }}
                          >
                            <Eye size={15} />
                          </button>

                          {can3a && (
                            <button
                              type="button"
                              className="action-3a"
                              title="Issue GSTR-3A"
                              disabled={mutationBusy}
                              onClick={() => openGstr3a(row)}
                            >
                              <FileText size={15} />
                            </button>
                          )}

                          {canAsmt && (
                            <button
                              type="button"
                              className="action-asmt"
                              title="Manual Section 62 assessment / Issue ASMT-13"
                              disabled={mutationBusy}
                              onClick={() => openAsmt13(row)}
                            >
                              <Gavel size={15} />
                            </button>
                          )}

                          {canReconcile && (
                            <button
                              type="button"
                              className="action-reconcile"
                              title="Re-check return filing and reconcile"
                              disabled={mutationBusy}
                              onClick={() => handleReconcile(row)}
                            >
                              <RefreshCw size={15} />
                            </button>
                          )}
                        </div>

                        {section62Eligible &&
                          !row.asmt13RefNo &&
                          !row.filingDate && (
                            <small className="proc-action-hint">
                              Officer review required
                            </small>
                          )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <footer className="proc-pagination">
          <span>
            Page {totalPages ? page + 1 : 0} of {totalPages}
          </span>

          <div>
            <button
              type="button"
              disabled={page <= 0 || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft size={16} /> Previous
            </button>

            <button
              type="button"
              disabled={!totalPages || page >= totalPages - 1 || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </footer>
      </section>

      <ProceedingDetailDrawer
        open={detailOpen}
        proceeding={selected}
        onClose={() => setDetailOpen(false)}
      />

      <Gstr3aIssueModal
        open={gstr3aOpen}
        proceeding={selected}
        busy={mutationBusy}
        error={actionError}
        onClose={() => !mutationBusy && setGstr3aOpen(false)}
        onConfirm={handleGstr3a}
      />

      <Asmt13AssessmentModal
        open={asmt13Open}
        proceeding={selected}
        busy={mutationBusy}
        error={actionError}
        onClose={() => !mutationBusy && setAsmt13Open(false)}
        onConfirm={handleAsmt13}
      />
    </main>
  );
}
