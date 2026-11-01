"use client";

import { useEffect, useState, type FormEvent } from "react";

export const dynamic = "force-dynamic";

type ConsultationResponse = {
  consultation?: {
    consultation_id?: number;
  };
  error?: string;
};

interface ConsultationPageProps {
  params: Promise<{ appointmentId: string }>;
}

export default function ConsultationPage({
  params,
}: ConsultationPageProps) {
  const [appointmentId, setAppointmentId] = useState<string>();
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [notes, setNotes] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [error, setError] = useState("");
  const [prescriptionUrl, setPrescriptionUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void params.then(({ appointmentId: id }) => setAppointmentId(id));
  }, [params]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPrescriptionUrl("");
    setIsSubmitting(true);

    try {
      const id = appointmentId ?? (await params).appointmentId;
      const numericAppointmentId = Number(id);
      if (!Number.isInteger(numericAppointmentId) || numericAppointmentId <= 0) {
        setError("Invalid appointment ID");
        return;
      }

      const response = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointment_id: numericAppointmentId,
          chief_complaint: chiefComplaint,
          notes,
          diagnosis,
        }),
      });
      const result = (await response.json()) as ConsultationResponse;

      if (!response.ok) {
        setError(result.error ?? "Unable to record consultation");
        return;
      }

      setPrescriptionUrl(`/doctor/prescriptions?appointmentId=${id}`);
    } catch {
      setError("Unable to reach the consultation service");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", padding: "2rem", background: "#f4f7fb" }}>
      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gap: "1rem",
          maxWidth: "42rem",
          margin: "0 auto",
          padding: "2rem",
          background: "#fff",
          borderRadius: "12px",
        }}
      >
        <h1>Record consultation</h1>
        <p>Appointment #{appointmentId ?? "..."}</p>

        <label>
          Chief complaint
          <textarea
            value={chiefComplaint}
            onChange={(event) => setChiefComplaint(event.target.value)}
            required
            rows={4}
            style={{ display: "block", width: "100%", marginTop: "0.35rem" }}
          />
        </label>

        <label>
          Notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={6}
            style={{ display: "block", width: "100%", marginTop: "0.35rem" }}
          />
        </label>

        <label>
          Diagnosis
          <textarea
            value={diagnosis}
            onChange={(event) => setDiagnosis(event.target.value)}
            rows={4}
            style={{ display: "block", width: "100%", marginTop: "0.35rem" }}
          />
        </label>

        {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}

        {prescriptionUrl ? (
          <a href={prescriptionUrl}>Continue to prescription</a>
        ) : (
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save consultation"}
          </button>
        )}
      </form>
    </main>
  );
}
