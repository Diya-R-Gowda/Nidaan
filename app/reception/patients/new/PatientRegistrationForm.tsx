"use client";

import { useState, type FormEvent } from "react";

type PatientResponse = { patient?: { patient_id?: number; full_name?: string }; error?: string };

const fieldStyle = {
  minHeight: 44, width: "100%", boxSizing: "border-box" as const,
  border: "1px solid #cbd5e1", borderRadius: 9, padding: "9px 11px",
  color: "#172033", background: "#fff", font: "inherit",
};
const labelStyle = { display: "grid", gap: 7, color: "#344054", fontSize: 14, fontWeight: 600 };

export default function PatientRegistrationForm() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSuccess("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const fullName = value("full_name");
    const dateOfBirth = value("date_of_birth");
    const sex = value("sex");
    const phone = value("phone");
    const email = value("email");
    const bloodGroup = value("blood_group");
    if (!fullName || !dateOfBirth || !sex || !phone) {
      setError("Complete the required name, date of birth, sex, and phone fields.");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address or leave the field blank.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/patients", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName, date_of_birth: dateOfBirth, sex, phone,
          email: email || null, blood_group: bloodGroup || null,
        }),
      });
      const body = await response.json().catch(() => null) as PatientResponse | null;
      if (response.status === 409) throw new Error(body?.error ?? "This email is already associated with a patient.");
      if (!response.ok) throw new Error(body?.error ?? "Unable to register the patient.");
      if (!Number.isSafeInteger(body?.patient?.patient_id)) throw new Error("The registration response was invalid.");
      setSuccess(`Patient ${body?.patient?.full_name ?? fullName} was registered (ID ${body?.patient?.patient_id}).`);
      formElement.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to register the patient.");
    } finally { setSubmitting(false); }
  }

  return (
    <section aria-labelledby="patient-form-heading" style={{ border: "1px solid #e2e8f0", borderRadius: 16, background: "#fff", padding: "26px clamp(18px, 5vw, 38px)", boxShadow: "0 12px 32px rgba(22, 34, 57, 0.05)" }}>
      <h2 id="patient-form-heading" style={{ marginTop: 0 }}>Patient details</h2>
      <p style={{ color: "#53627b", lineHeight: 1.5 }}>Fields marked required are needed to register a record. Optional email is checked for an existing match.</p>
      {error && <p role="alert" style={{ color: "#a32020" }}>{error}</p>}
      {success && <p role="status" style={{ color: "#067647" }}>{success} You can now select the patient when booking.</p>}
      <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <label style={labelStyle}>Full name *<input name="full_name" autoComplete="name" maxLength={120} required style={fieldStyle} /></label>
        <label style={labelStyle}>Date of birth *<input name="date_of_birth" type="date" required style={fieldStyle} /></label>
        <label style={labelStyle}>Sex *<input name="sex" maxLength={20} required style={fieldStyle} /></label>
        <label style={labelStyle}>Phone *<input name="phone" type="tel" autoComplete="tel" maxLength={30} required style={fieldStyle} /></label>
        <label style={labelStyle}>Email (optional)<input name="email" type="email" autoComplete="email" maxLength={255} style={fieldStyle} /></label>
        <label style={labelStyle}>Blood group (optional)<input name="blood_group" maxLength={10} style={fieldStyle} /></label>
        <div style={{ gridColumn: "1 / -1" }}>
          <button type="submit" disabled={submitting} style={{ minHeight: 46, border: 0, borderRadius: 9, padding: "10px 18px", background: submitting ? "#7788ae" : "#3157a4", color: "#fff", font: "inherit", fontWeight: 700, cursor: submitting ? "wait" : "pointer" }}>
            {submitting ? "Registering…" : "Register patient"}
          </button>
        </div>
      </form>
      <p style={{ marginBottom: 0, color: "#667085", fontSize: 13 }}>The form does not display patient records or expose additional medical information.</p>
    </section>
  );
}
