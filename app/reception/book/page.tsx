"use client";

import { useEffect, useState, type FormEvent } from "react";

type PatientOption = {
  patient_id: number;
  full_name: string;
};

type DoctorOption = {
  doctor_id: number;
  full_name: string;
};

type AppointmentOptions = {
  patients: PatientOption[];
  doctors: DoctorOption[];
};

type AppointmentMode = "in_person" | "online";

function isOption(value: unknown): value is PatientOption {
  return (
    typeof value === "object" &&
    value !== null &&
    "patient_id" in value &&
    typeof value.patient_id === "number" &&
    "full_name" in value &&
    typeof value.full_name === "string"
  );
}

function isDoctorOption(value: unknown): value is DoctorOption {
  return (
    typeof value === "object" &&
    value !== null &&
    "doctor_id" in value &&
    typeof value.doctor_id === "number" &&
    "full_name" in value &&
    typeof value.full_name === "string"
  );
}

function isAppointmentOptions(value: unknown): value is AppointmentOptions {
  return (
    typeof value === "object" &&
    value !== null &&
    "patients" in value &&
    Array.isArray(value.patients) &&
    value.patients.every(isOption) &&
    "doctors" in value &&
    Array.isArray(value.doctors) &&
    value.doctors.every(isDoctorOption)
  );
}

function apiError(value: unknown, fallback: string): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }
  return fallback;
}

const fieldStyle = {
  width: "100%",
  minHeight: 46,
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#fff",
  color: "#172033",
  font: "inherit",
};

const labelStyle = {
  display: "grid",
  gap: 8,
  color: "#344054",
  fontSize: 14,
  fontWeight: 600,
};

export default function ReceptionBookingPage() {
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState("");
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [slotStart, setSlotStart] = useState("");
  const [slotEnd, setSlotEnd] = useState("");
  const [mode, setMode] = useState<AppointmentMode>("in_person");
  const [meetingLink, setMeetingLink] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadOptions() {
      setLoadingOptions(true);
      setOptionsError("");

      try {
        const response = await fetch("/api/appointments/options", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            apiError(data, "Unable to load patient and doctor options."),
          );
        }

        if (!isAppointmentOptions(data)) {
          throw new Error("The patient and doctor options response was invalid.");
        }

        setPatients(data.patients);
        setDoctors(data.doctors);
      } catch (error) {
        if (!controller.signal.aborted) {
          setOptionsError(
            error instanceof Error
              ? error.message
              : "Unable to load patient and doctor options.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoadingOptions(false);
      }
    }

    void loadOptions();
    return () => controller.abort();
  }, []);

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError("");
    setSubmissionError("");
    setSuccessMessage("");

    if (!patientId || !doctorId) {
      setValidationError("Choose both a patient and a doctor.");
      return;
    }

    if (!slotStart || !slotEnd) {
      setValidationError("Enter both the appointment start and end times.");
      return;
    }

    const startDate = new Date(slotStart);
    const endDate = new Date(slotEnd);
    if (
      !Number.isFinite(startDate.getTime()) ||
      !Number.isFinite(endDate.getTime())
    ) {
      setValidationError("Enter valid appointment date and times.");
      return;
    }
    if (endDate.getTime() <= startDate.getTime()) {
      setValidationError("The end time must be later than the start time.");
      return;
    }

    if (mode === "online" && !meetingLink.trim()) {
      setValidationError("Enter a meeting link for an online appointment.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: Number(patientId),
          doctor_id: Number(doctorId),
          slot_start: startDate.toISOString(),
          slot_end: endDate.toISOString(),
          mode,
          meeting_link: mode === "online" ? meetingLink.trim() : null,
        }),
      });
      const data: unknown = await response.json().catch(() => null);

      if (response.status === 409) {
        throw new Error(
          "That doctor already has an appointment during this time. Choose another slot.",
        );
      }
      if (!response.ok) {
        throw new Error(apiError(data, "Unable to book this appointment."));
      }

      const appointmentId =
        typeof data === "object" &&
        data !== null &&
        "appointment" in data &&
        typeof data.appointment === "object" &&
        data.appointment !== null &&
        "appointment_id" in data.appointment &&
        typeof data.appointment.appointment_id === "number"
          ? data.appointment.appointment_id
          : null;

      setSuccessMessage(
        appointmentId
          ? `Appointment #${appointmentId} was booked successfully.`
          : "Appointment booked successfully.",
      );
    } catch (error) {
      setSubmissionError(
        error instanceof Error ? error.message : "Unable to book this appointment.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const noticeStyle = {
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 14,
    lineHeight: 1.5,
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f4f7fb",
        padding: "36px 20px 56px",
        color: "#172033",
      }}
    >
      <div style={{ width: "100%", maxWidth: 780, margin: "0 auto" }}>
        <a
          href="/reception"
          style={{ color: "#3157a4", fontSize: 14, fontWeight: 600 }}
        >
          ← Reception
        </a>

        <header style={{ margin: "24px 0" }}>
          <p
            style={{
              color: "#53627b",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Front desk
          </p>
          <h1 style={{ marginTop: 8, fontSize: 32, letterSpacing: "-0.03em" }}>
            Book an appointment
          </h1>
          <p style={{ marginTop: 10, color: "#596579", lineHeight: 1.6 }}>
            Select a patient, a doctor, and an appointment time.
          </p>
        </header>

        <section
          aria-labelledby="booking-form-title"
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            background: "#fff",
            padding: "28px clamp(20px, 5vw, 40px)",
            boxShadow: "0 12px 32px rgba(22, 34, 57, 0.06)",
          }}
        >
          <h2 id="booking-form-title" style={{ marginBottom: 22, fontSize: 20 }}>
            Appointment details
          </h2>

          {loadingOptions && (
            <p
              role="status"
              style={{
                ...noticeStyle,
                marginBottom: 18,
                background: "#eff6ff",
                color: "#1e40af",
              }}
            >
              Loading patient and doctor options…
            </p>
          )}
          {optionsError && (
            <p
              role="alert"
              style={{
                ...noticeStyle,
                marginBottom: 18,
                background: "#fff1f0",
                color: "#a32020",
              }}
            >
              {optionsError}
            </p>
          )}
          {patients.length === 0 && !loadingOptions && !optionsError && (
            <p
              style={{
                ...noticeStyle,
                marginBottom: 18,
                background: "#f8fafc",
                color: "#53627b",
              }}
            >
              No patients are available to select.
            </p>
          )}
          {doctors.length === 0 && !loadingOptions && !optionsError && (
            <p
              style={{
                ...noticeStyle,
                marginBottom: 18,
                background: "#f8fafc",
                color: "#53627b",
              }}
            >
              No active prescribers are available to select.
            </p>
          )}

          <form noValidate onSubmit={submitBooking}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 18,
              }}
            >
              <label style={labelStyle} htmlFor="patient-id">
                Patient
                <select
                  id="patient-id"
                  value={patientId}
                  onChange={(event) => setPatientId(event.target.value)}
                  disabled={loadingOptions || Boolean(optionsError)}
                  style={fieldStyle}
                >
                  <option value="">Select a patient</option>
                  {patients.map((patient) => (
                    <option key={patient.patient_id} value={patient.patient_id}>
                      {patient.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={labelStyle} htmlFor="doctor-id">
                Doctor
                <select
                  id="doctor-id"
                  value={doctorId}
                  onChange={(event) => setDoctorId(event.target.value)}
                  disabled={loadingOptions || Boolean(optionsError)}
                  style={fieldStyle}
                >
                  <option value="">Select a doctor</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.doctor_id} value={doctor.doctor_id}>
                      {doctor.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={labelStyle} htmlFor="slot-start">
                Start date and time
                <input
                  id="slot-start"
                  type="datetime-local"
                  value={slotStart}
                  onChange={(event) => setSlotStart(event.target.value)}
                  style={fieldStyle}
                />
              </label>

              <label style={labelStyle} htmlFor="slot-end">
                End date and time
                <input
                  id="slot-end"
                  type="datetime-local"
                  min={slotStart || undefined}
                  value={slotEnd}
                  onChange={(event) => setSlotEnd(event.target.value)}
                  style={fieldStyle}
                />
              </label>
            </div>

            <fieldset style={{ marginTop: 24, border: 0, padding: 0 }}>
              <legend style={{ ...labelStyle, display: "block", marginBottom: 10 }}>
                Appointment mode
              </legend>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {([
                  ["in_person", "In person"],
                  ["online", "Online"],
                ] as const).map(([value, label]) => (
                  <label
                    key={value}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 9,
                      minHeight: 44,
                      padding: "8px 14px",
                      border: `1px solid ${mode === value ? "#3157a4" : "#cbd5e1"}`,
                      borderRadius: 10,
                      background: mode === value ? "#eff4ff" : "#fff",
                      color: "#26344b",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="appointment-mode"
                      value={value}
                      checked={mode === value}
                      onChange={() => setMode(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            {mode === "online" && (
              <label style={{ ...labelStyle, marginTop: 20 }} htmlFor="meeting-link">
                Meeting link
                <input
                  id="meeting-link"
                  type="text"
                  value={meetingLink}
                  onChange={(event) => setMeetingLink(event.target.value)}
                  placeholder="https://…"
                  style={fieldStyle}
                />
              </label>
            )}

            {validationError && (
              <p
                role="alert"
                style={{
                  ...noticeStyle,
                  marginTop: 20,
                  background: "#fff7e6",
                  color: "#8a4b08",
                }}
              >
                {validationError}
              </p>
            )}
            {submissionError && (
              <p
                role="alert"
                style={{
                  ...noticeStyle,
                  marginTop: 20,
                  background: "#fff1f0",
                  color: "#a32020",
                }}
              >
                {submissionError}
              </p>
            )}
            {successMessage && (
              <p
                role="status"
                style={{
                  ...noticeStyle,
                  marginTop: 20,
                  background: "#ecfdf3",
                  color: "#067647",
                }}
              >
                {successMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={
                loadingOptions ||
                Boolean(optionsError) ||
                patients.length === 0 ||
                doctors.length === 0 ||
                submitting
              }
              style={{
                width: "100%",
                minHeight: 48,
                marginTop: 24,
                border: 0,
                borderRadius: 10,
                background: submitting ? "#7788ae" : "#3157a4",
                color: "#fff",
                font: "inherit",
                fontWeight: 700,
                cursor: submitting ? "wait" : "pointer",
              }}
            >
              {submitting ? "Booking appointment…" : "Book appointment"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
