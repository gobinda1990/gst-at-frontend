import React, { useEffect, useMemo, useState } from "react";
import { Gavel, Loader2, X } from "lucide-react";

const EMPTY = {
  assessedTax: "",
  assessedInterest: "",
  assessedPenalty: "",
  assessedLateFee: "",
  assessedOther: "",
  findings: "",
};

const amount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export default function Asmt13AssessmentModal({
  open,
  proceeding,
  busy = false,
  error = "",
  onClose,
  onConfirm,
}) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (open) setForm(EMPTY);
  }, [open, proceeding?.id]);

  const total = useMemo(
    () =>
      amount(form.assessedTax) +
      amount(form.assessedInterest) +
      amount(form.assessedPenalty) +
      amount(form.assessedLateFee) +
      amount(form.assessedOther),
    [form],
  );

  if (!open || !proceeding) return null;

  const update = (name) => (event) =>
    setForm((current) => ({ ...current, [name]: event.target.value }));

  const valid =
    form.findings.trim().length >= 10 &&
    ["assessedTax", "assessedInterest", "assessedPenalty", "assessedLateFee", "assessedOther"]
      .every((key) => form[key] !== "" && Number(form[key]) >= 0);

  return (
    <div className="proc-modal-backdrop">
      <section className="proc-modal" role="dialog" aria-modal="true">
        <header className="proc-modal-header">
          <div>
            <h2>Section 62 Assessment</h2>
            <p>Prepare officer-reviewed ASMT-13 values</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={19} />
          </button>
        </header>

        <div className="proc-modal-body">
          <div className="proc-case-strip">
            <span><b>GSTIN</b> {proceeding.gstin}</span>
            <span><b>Period</b> {proceeding.retPeriod}</span>
            <span><b>Proceeding</b> #{proceeding.id}</span>
          </div>

          <div className="proc-amount-grid">
            {[
              ["assessedTax", "Tax"],
              ["assessedInterest", "Interest"],
              ["assessedPenalty", "Penalty"],
              ["assessedLateFee", "Late Fee"],
              ["assessedOther", "Other"],
            ].map(([key, label]) => (
              <label className="proc-field" key={key}>
                <span>{label} (₹)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form[key]}
                  onChange={update(key)}
                  inputMode="decimal"
                />
              </label>
            ))}
          </div>

          <div className="proc-assessment-total">
            <span>Total Proposed Assessment</span>
            <strong>₹{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong>
          </div>

          <label className="proc-field">
            <span>Officer Findings / Basis of Best Judgment *</span>
            <textarea
              rows={6}
              maxLength={4000}
              value={form.findings}
              onChange={update("findings")}
              placeholder="Record the material considered and findings. Do not use an ML score as the legal basis."
            />
            <small>{form.findings.length}/4000</small>
          </label>

          {error && <div className="proc-form-error">{error}</div>}
        </div>

        <footer className="proc-modal-footer">
          <button type="button" className="proc-btn proc-btn-light" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="proc-btn proc-btn-danger"
            disabled={busy || !valid}
            onClick={() =>
              onConfirm?.({
                proceedingId: proceeding.id,
                assessedTax: amount(form.assessedTax),
                assessedInterest: amount(form.assessedInterest),
                assessedPenalty: amount(form.assessedPenalty),
                assessedLateFee: amount(form.assessedLateFee),
                assessedOther: amount(form.assessedOther),
                findings: form.findings.trim(),
              })
            }
          >
            {busy ? <Loader2 size={16} className="proc-spin" /> : <Gavel size={16} />}
            {busy ? "Submitting..." : "Issue ASMT-13"}
          </button>
        </footer>
      </section>
    </div>
  );
}
