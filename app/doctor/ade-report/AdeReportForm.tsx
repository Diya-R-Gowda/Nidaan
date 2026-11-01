"use client";

import { useState, type FormEvent } from "react";

type PatientOption = { patient_id: number; full_name: string };
type ItemOption = {
  item_id: number;
  patient_name: string;
  drug_name: string;
  dose: string;
};

const fieldStyle = {
  width: "100%",
  minHeight: 42,
  boxSizing: "border-box" as const,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "9px 11px",
  font: "inherit",
};

export default function AdeReportForm({
  patients,
  items,
}: {
  patients: PatientOption[];
  items: ItemOption[];
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reportId, setReportId] = useState<number | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const patientId = Number(formData.get("patientId"));
    const itemValue = formData.get("itemId");
    const itemId = itemValue === "" ? null : Number(itemValue);
    const onsetDate = formData.get("onsetDate");
    const narrative = formData.get("narrative");

    if (
      !Number.isSafeInteger(patientId) || patientId < 1 ||
      (itemId !== null && (!Number.isSafeInteger(itemId) || itemId < 1)) ||
      typeof onsetDate !== "string" ||
      typeof narrative !== "string" ||
      narrative.trim().length < 20
    ) {
      setError("Check the selected records, onset date, and narrative length.");
      setReportId(null);
      return;
    }

    setIsSubmitting(true);
    setError("");
    setReportId(null);

    try {
      const response = await fetch("/api/ade-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, itemId, onsetDate, narrative }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const responseRecord =
        typeof payload === "object" && payload !== null
          ? (payload as Record<string, unknown>)
          : null;

      if (response.ok && responseRecord && Number.isSafeInteger(responseRecord.reportId)) {
        setReportId(responseRecord.reportId as number);
        form.reset();
      } else if (response.status === 404) {
        setError("The selected patient or prescription item is not available through your appointments.");
      } else if (response.status === 400) {
        setError("Check the selected records, onset date, and narrative length.");
      } else if (response.status === 401 || response.status === 403) {
        setError("Your session is no longer authorized to submit this report. Sign in again or contact an administrator.");
      } else {
        setError("The report could not be submitted. Please try again later.");
      }
    } catch {
      setError("The report could not be submitted because the service is unavailable. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {error && <p role="alert" style={{ border: "1px solid #fecaca", borderRadius: 10, background: "#fff7f7", padding: 14, color: "#a32020" }}>{error}</p>}
      {reportId !== null && <p role="status" style={{ border: "1px solid #bbf7d0", borderRadius: 10, background: "#f0fdf4", padding: 14, color: "#067647" }}>Adverse-event report #{reportId} was submitted.</p>}
      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gap: 16 }}>
          <label htmlFor="patientId" style={{ display: "grid", gap: 6, fontWeight: 600 }}>Patient
            <select id="patientId" name="patientId" required style={fieldStyle} defaultValue="">
              <option value="" disabled>Select a patient</option>
              {patients.map((patient) => <option key={patient.patient_id} value={patient.patient_id}>{patient.full_name} (#{patient.patient_id})</option>)}
            </select>
          </label>
          <label htmlFor="itemId" style={{ display: "grid", gap: 6, fontWeight: 600 }}>Suspected prescription item <span style={{ color: "#596579", fontSize: 13, fontWeight: 400 }}>Optional if the item is unknown</span>
            <select id="itemId" name="itemId" style={fieldStyle} defaultValue="">
              <option value="">Unknown / not applicable</option>
              {items.map((item) => <option key={item.item_id} value={item.item_id}>{item.drug_name} — {item.patient_name} · item #{item.item_id}</option>)}
            </select>
          </label>
          <label htmlFor="onsetDate" style={{ display: "grid", gap: 6, fontWeight: 600 }}>Symptom onset date<input id="onsetDate" name="onsetDate" type="date" required style={fieldStyle} /></label>
          <label htmlFor="narrative" style={{ display: "grid", gap: 6, fontWeight: 600 }}>Narrative<textarea id="narrative" name="narrative" minLength={20} required rows={6} aria-describedby="narrative-hint" style={{ ...fieldStyle, minHeight: 150, resize: "vertical" }} /></label>
          <p id="narrative-hint" style={{ margin: "-10px 0 0", color: "#596579", fontSize: 13 }}>Describe the reported event in at least 20 characters.</p>
        </div>
        <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} style={{ marginTop: 18, minHeight: 42, border: 0, borderRadius: 9, background: isSubmitting ? "#8196c2" : "#3157a4", color: "#fff", padding: "10px 16px", font: "inherit", fontWeight: 700, cursor: isSubmitting ? "wait" : "pointer" }}>{isSubmitting ? "Submitting…" : "Submit report"}</button>
        <p role="status" aria-live="polite" style={{ minHeight: 20, margin: "10px 0 0", color: "#596579", fontSize: 13 }}>{isSubmitting ? "Submitting report…" : ""}</p>
      </form>
    </>
  );
}
