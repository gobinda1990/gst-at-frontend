import React, { useEffect, useState } from "react";
import { History, Loader2, X } from "lucide-react";
import { apiMessage, fetchProceedingAudit, isAbortError } from "../services/defaulterProceedingService";

const pretty = (value) =>
  String(value || "—").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export default function ProceedingDetailDrawer({ open, proceeding, onClose }) {
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !proceeding?.id) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchProceedingAudit(proceeding.id, { signal: controller.signal })
      .then((r) => setAudit(Array.isArray(r) ? r : r?.content || []))
      .catch((e) => {
        if (!isAbortError(e)) setError(apiMessage(e, "Unable to load action history."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, proceeding?.id]);

  if (!open || !proceeding) return null;

  return (
    <div className="proc-drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <aside className="proc-drawer">
        <header className="proc-drawer-header">
          <div><h2>Proceeding #{proceeding.id}</h2><p>{proceeding.gstin} • {proceeding.retPeriod}</p></div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={20}/></button>
        </header>
        <div className="proc-drawer-body">
          <section className="proc-detail-card">
            <h3>Statutory Position</h3>
            <dl className="proc-detail-grid">
              <div><dt>Status</dt><dd>{pretty(proceeding.status)}</dd></div>
              <div><dt>Due Date</dt><dd>{proceeding.dueDate || "—"}</dd></div>
              <div><dt>GSTR-3A Ref.</dt><dd>{proceeding.gstr3aRefNo || "—"}</dd></div>
              <div><dt>GSTR-3A Issue</dt><dd>{proceeding.gstr3aIssueDate || "—"}</dd></div>
              <div><dt>3A Deadline</dt><dd>{proceeding.gstr3aDeadline || "—"}</dd></div>
              <div><dt>Section 62</dt><dd>{proceeding.section62Eligible === "Y" ? "Eligible" : "Not eligible"}</dd></div>
              <div><dt>ASMT-13 Ref.</dt><dd>{proceeding.asmt13RefNo || "—"}</dd></div>
              <div><dt>ASMT-13 Order</dt><dd>{proceeding.asmt13OrderDate || "—"}</dd></div>
              <div><dt>First Window End</dt><dd>{proceeding.first60DayEnd || "—"}</dd></div>
              <div><dt>Extended Window End</dt><dd>{proceeding.extended60DayEnd || "—"}</dd></div>
            </dl>
          </section>
          <section className="proc-detail-card">
            <h3><History size={16}/> Action Audit</h3>
            {loading ? <div className="proc-empty"><Loader2 className="proc-spin" size={18}/> Loading history...</div>
              : error ? <div className="proc-form-error">{error}</div>
              : !audit.length ? <div className="proc-empty">No statutory actions recorded.</div>
              : <div className="proc-timeline">
                  {audit.map((item, i) => (
                    <article key={item.id ?? `${item.actionType}-${i}`} className="proc-timeline-item">
                      <span className="proc-timeline-dot"/>
                      <div>
                        <strong>{pretty(item.actionType)}</strong>
                        <p>{item.remarks || `${pretty(item.oldStatus)} → ${pretty(item.newStatus)}`}</p>
                        <small>{item.actionAt || "—"} {item.officerHrms ? `• ${item.officerHrms}` : ""}</small>
                        {item.referenceNo && <code>{item.referenceNo}</code>}
                      </div>
                    </article>
                  ))}
                </div>}
          </section>
        </div>
      </aside>
    </div>
  );
}
