"use client";

import { useRef, useState, type FormEvent } from "react";

interface ConsultationFormProps {
  appointmentId: number;
  existingConsultationId?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default function ConsultationForm({
  appointmentId,
  existingConsultationId,
}: ConsultationFormProps) {
  const submissionInProgress = useRef(false);
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [notes, setNotes] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [existingConsultationMessage, setExistingConsultationMessage] = useState("");
  const [prescriptionUrl, setPrescriptionUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (existingConsultationId) {
    const prescriptionHref = `/doctor/prescriptions?consultationId=${existingConsultationId}`;
    return (
      <main
        style={{
          minHeight: "100vh",
          padding: "clamp(20px, 5vw, 40px)",
          background: "#f4f7fb",
          color: "#172033",
          colorScheme: "light",
        }}
      >
        <section
          style={{
            display: "grid",
            gap: "1rem",
            width: "100%",
            maxWidth: "42rem",
            margin: "0 auto",
            padding: "clamp(20px, 5vw, 32px)",
            background: "#fff",
            border: "1px solid #d0d5dd",
            borderRadius: "12px",
            boxShadow: "0 8px 24px rgba(22, 34, 57, 0.06)",
          }}
        >
          <h1 style={{ fontSize: 28, lineHeight: 1.2 }}>Consultation already recorded</h1>
          <p role="status" style={{ color: "#475467" }}>
            Consultation #{existingConsultationId} is linked to appointment #{appointmentId}.
          </p>
          <a className="consultation-action" href={prescriptionHref}>
            Continue to prescription builder
          </a>
        </section>
      </main>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionInProgress.current) return;

    setError("");
    setSuccessMessage("");
    setExistingConsultationMessage("");
    setPrescriptionUrl("");
    submissionInProgress.current = true;
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointment_id: appointmentId,
          chief_complaint: chiefComplaint,
          notes,
          diagnosis,
        }),
      });
      const result: unknown = await response.json();

      if (!response.ok) {
        const existingConsultationId = isRecord(result)
          ? result.consultation_id
          : undefined;
        if (
          response.status === 409 &&
          typeof existingConsultationId === "number" &&
          Number.isSafeInteger(existingConsultationId) &&
          existingConsultationId > 0
        ) {
          setExistingConsultationMessage(
            `A consultation (#${existingConsultationId}) is already recorded for this appointment.`,
          );
          setPrescriptionUrl(
            `/doctor/prescriptions?consultationId=${existingConsultationId}`,
          );
          return;
        }
        setError(
          isRecord(result) && typeof result.error === "string"
            ? result.error
            : "Unable to record consultation",
        );
        return;
      }

      const consultationId = isRecord(result) && isRecord(result.consultation)
        ? result.consultation.consultation_id
        : undefined;
      if (
        typeof consultationId !== "number" ||
        !Number.isSafeInteger(consultationId) ||
        consultationId <= 0
      ) {
        setError("The consultation response was incomplete. Please refresh and check before retrying.");
        return;
      }

      setPrescriptionUrl(
        `/doctor/prescriptions?consultationId=${consultationId}`,
      );
      setSuccessMessage(`Consultation #${consultationId} was saved.`);
    } catch {
      setError("Unable to reach the consultation service");
    } finally {
      submissionInProgress.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "clamp(20px, 5vw, 40px)",
        background: "#f4f7fb",
        color: "#172033",
        colorScheme: "light",
      }}
    >
      <form
        onSubmit={handleSubmit}
        aria-busy={isSubmitting}
        style={{
          display: "grid",
          gap: "1rem",
          width: "100%",
          maxWidth: "42rem",
          margin: "0 auto",
          padding: "clamp(20px, 5vw, 32px)",
          background: "#fff",
          border: "1px solid #d0d5dd",
          borderRadius: "12px",
          boxShadow: "0 8px 24px rgba(22, 34, 57, 0.06)",
        }}
      >
        <h1 style={{ fontSize: 28, lineHeight: 1.2 }}>Record consultation</h1>
        <p style={{ color: "#475467" }}>Appointment #{appointmentId}</p>

        <label className="consultation-field">
          <span>Chief complaint <span aria-hidden="true">(required)</span></span>
          <textarea
            value={chiefComplaint}
            onChange={(event) => setChiefComplaint(event.target.value)}
            required
            disabled={isSubmitting || Boolean(prescriptionUrl)}
            rows={4}
            autoComplete="off"
          />
        </label>

        <label className="consultation-field">
          <span>Clinical notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={isSubmitting || Boolean(prescriptionUrl)}
            rows={6}
            autoComplete="off"
          />
        </label>

        <label className="consultation-field">
          <span>Diagnosis</span>
          <textarea
            value={diagnosis}
            onChange={(event) => setDiagnosis(event.target.value)}
            disabled={isSubmitting || Boolean(prescriptionUrl)}
            rows={4}
            autoComplete="off"
          />
        </label>

        {error && <p role="alert" className="consultation-error">{error}</p>}

        {successMessage && (
          <p role="status" className="consultation-success" aria-live="polite">
            {successMessage}
          </p>
        )}

        {existingConsultationMessage && (
          <p role="status" className="consultation-notice" aria-live="polite">
            {existingConsultationMessage}
          </p>
        )}

        {isSubmitting && (
          <p role="status" aria-live="polite" className="consultation-progress">
            Saving consultation…
          </p>
        )}

        {prescriptionUrl ? (
          <a className="consultation-action" href={prescriptionUrl}>
            Continue to prescription workflow
          </a>
        ) : (
          <button
            className="consultation-action"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving consultation…" : "Save consultation"}
          </button>
        )}
      </form>
    </main>
  );
}
