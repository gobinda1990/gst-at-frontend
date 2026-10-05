import React, { useEffect, useState } from "react";
import { AlertTriangle, FileText, Loader2, X } from "lucide-react";

export default function Gstr3aIssueModal({
  open,
  proceeding,
  busy = false,
  error = "",
  onClose,
  onConfirm,
}) {
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (open) setRemarks("");
  }, [open, proceeding?.id]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => {
      if (event.key === "Escape" && !busy) onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, busy, onClose]);

  if (!open || !proceeding) return null;

  return (
    <div className="proc-modal-backdrop">
      <section className="proc-modal proc-modal-small" role="dialog" aria-modal="true">
        <header className="proc-modal-header">
          <div>
            <h2>Issue GSTR-3A</h2>
            <p>Section 46 read with Rule 68</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={19} />
          </button>
        </header>

        <div className="proc-modal-body">
          <div className="proc-warning">
            <AlertTriangle size={18} />
            <div>
              <strong>Officer confirmation required</strong>
              <p>The backend will re-check filing status, eligibility and jurisdiction before issuance.</p>
            </div>
          </div>

          <dl className="proc-confirm-grid">
            <div><dt>GSTIN</dt><dd>{proceeding.gstin}</dd></div>
            <div><dt>Return Period</dt><dd>{proceeding.retPeriod}</dd></div>
            <div><dt>Due Date</dt><dd>{proceeding.dueDate || "—"}</dd></div>
            <div><dt>Status</dt><dd>{proceeding.status || "—"}</dd></div>
          </dl>

          <label className="proc-field">
            <span>Officer Remarks</span>
            <textarea
              rows={4}
              maxLength={1000}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional remarks for the statutory action audit trail"
            />
            <small>{remarks.length}/1000</small>
          </label>

          {error && <div className="proc-form-error">{error}</div>}
        </div>

        <footer className="proc-modal-footer">
          <button type="button" className="proc-btn proc-btn-light" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="proc-btn proc-btn-primary"
            disabled={busy}
            onClick={() =>
              onConfirm?.({
                gstin: proceeding.gstin,
                retPeriod: proceeding.retPeriod,
                remarks: remarks.trim() || null,
              })
            }
          >
            {busy ? <Loader2 size={16} className="proc-spin" /> : <FileText size={16} />}
            {busy ? "Issuing..." : "Confirm & Issue"}
          </button>
        </footer>
      </section>
    </div>
  );
}
