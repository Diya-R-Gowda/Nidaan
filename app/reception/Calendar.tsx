"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Appointment = {
  appointment_id: number;
  slot_start: string;
  slot_end: string;
  mode: "in_person" | "online";
  status: string;
  patient_name: string;
  doctor_id: number;
  doctor_name: string;
};

function todayInIndia(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function rangeStart(date: string, mode: "day" | "week"): string {
  if (mode === "day") return date;
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -((day + 6) % 7));
}

function dateTimeInput(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function toUtc(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}:00+05:30`);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function displayTime(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value));
}

function appointmentDate(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", dateStyle: "full",
  }).format(new Date(`${value}T00:00:00+05:30`));
}

function apiError(body: unknown, fallback: string): string {
  return typeof body === "object" && body !== null && "error" in body &&
    typeof body.error === "string" ? body.error : fallback;
}

const card = {
  border: "1px solid #e2e8f0", borderRadius: 14, background: "#fff",
  padding: 20, boxShadow: "0 8px 24px rgba(22, 34, 57, 0.04)",
};
const field = {
  minHeight: 42, border: "1px solid #cbd5e1", borderRadius: 8,
  padding: "8px 10px", font: "inherit", color: "#172033", background: "#fff",
};

export default function ReceptionCalendar() {
  const [mode, setMode] = useState<"day" | "week">("week");
  const [selectedDate, setSelectedDate] = useState(todayInIndia);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [newTimes, setNewTimes] = useState<Record<number, { start: string; end: string }>>({});

  const from = useMemo(() => rangeStart(selectedDate, mode), [selectedDate, mode]);
  const to = useMemo(() => mode === "day" ? from : shiftDate(from, 6), [from, mode]);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/appointments?from=${from}&to=${to}&limit=200`, { cache: "no-store" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(body, "Unable to load appointments."));
      if (typeof body !== "object" || body === null || !("appointments" in body) || !Array.isArray(body.appointments)) {
        throw new Error("The appointment response was invalid.");
      }
      const rows = body.appointments as Appointment[];
      setAppointments(rows);
      setNewTimes(Object.fromEntries(rows.map((item) => [item.appointment_id, {
        start: dateTimeInput(item.slot_start), end: dateTimeInput(item.slot_end),
      }])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load appointments.");
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void loadAppointments(); }, [loadAppointments]);

  async function reschedule(id: number) {
    const times = newTimes[id];
    const slotStart = times ? toUtc(times.start) : null;
    const slotEnd = times ? toUtc(times.end) : null;
    if (!slotStart || !slotEnd || Date.parse(slotEnd) <= Date.parse(slotStart)) {
      setError("Enter valid appointment times, with the end later than the start.");
      return;
    }
    await saveReschedule(id, slotStart, slotEnd);
  }

  async function saveReschedule(id: number, slotStart: string, slotEnd: string) {
    setBusyId(id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/appointments/${id}/reschedule`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot_start: slotStart, slot_end: slotEnd }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 409) throw new Error(apiError(body, "That time conflicts with another appointment."));
      if (!response.ok) throw new Error(apiError(body, "Unable to reschedule this appointment."));
      setMessage(`Appointment #${id} was rescheduled.`);
      await loadAppointments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reschedule this appointment.");
    } finally { setBusyId(null); }
  }

  async function dropOnDate(id: number, targetDate: string) {
    const appointment = appointments.find((item) => item.appointment_id === id);
    const times = newTimes[id];
    if (!appointment || !times || appointmentDate(appointment.slot_start) === targetDate) return;
    const startDate = times.start.slice(0, 10);
    const endDate = times.end.slice(0, 10);
    const dayDelta = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000;
    const movedStart = toUtc(`${targetDate}T${times.start.slice(11)}`);
    const movedEnd = toUtc(`${shiftDate(targetDate, dayDelta)}T${times.end.slice(11)}`);
    if (!movedStart || !movedEnd || Date.parse(movedEnd) <= Date.parse(movedStart)) {
      setError("This appointment could not be moved to that date.");
      return;
    }
    await saveReschedule(id, movedStart, movedEnd);
  }

  async function cancel(id: number) {
    if (!window.confirm(`Cancel appointment #${id}?`)) return;
    setBusyId(id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/appointments/${id}/cancel`, { method: "POST" });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 409) throw new Error(apiError(body, "This appointment can no longer be cancelled."));
      if (!response.ok) throw new Error(apiError(body, "Unable to cancel this appointment."));
      setMessage(`Appointment #${id} is cancelled. Its record remains available for history.`);
      await loadAppointments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to cancel this appointment.");
    } finally { setBusyId(null); }
  }

  const title = mode === "day" ? from : `${from} – ${to}`;
  const calendarDays = useMemo(() => {
    const dayCount = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    return Array.from({ length: dayCount + 1 }, (_, index) => {
      const date = shiftDate(from, index);
      return { date, appointments: appointments.filter((item) => appointmentDate(item.slot_start) === date) };
    });
  }, [appointments, from, to]);

  return (
    <section aria-labelledby="calendar-title" style={card}>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
        <div>
          <h2 id="calendar-title" style={{ margin: 0, fontSize: 23 }}>Appointment calendar</h2>
          <p style={{ margin: "7px 0 0", color: "#53627b" }}>{title} · India Standard Time</p>
        </div>
        <div role="group" aria-label="Calendar view" style={{ display: "flex", gap: 8 }}>
          <button type="button" aria-pressed={mode === "day"} onClick={() => setMode("day")} style={field}>Day</button>
          <button type="button" aria-pressed={mode === "week"} onClick={() => setMode("week")} style={field}>Week</button>
        </div>
      </header>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, margin: "18px 0" }}>
        <button type="button" onClick={() => setSelectedDate(shiftDate(selectedDate, mode === "day" ? -1 : -7))} style={field} aria-label="Previous date range">← Previous</button>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          Anchor date <input type="date" value={selectedDate} onChange={(event) => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setSelectedDate(event.target.value); }} style={field} />
        </label>
        <button type="button" onClick={() => setSelectedDate(todayInIndia())} style={field}>Today</button>
        <button type="button" onClick={() => setSelectedDate(shiftDate(selectedDate, mode === "day" ? 1 : 7))} style={field} aria-label="Next date range">Next →</button>
        <button type="button" onClick={() => void loadAppointments()} disabled={loading} style={field}>Refresh</button>
      </div>
      {loading && <p role="status">Loading appointments…</p>}
      {error && <p role="alert" style={{ color: "#a32020" }}>{error}</p>}
      {message && <p role="status" style={{ color: "#067647" }}>{message}</p>}
      {!loading && !error && appointments.length === 0 && <p role="status">No appointments are scheduled for this {mode} view.</p>}
      {!loading && !error && appointments.length > 0 && (
        <>
          <p style={{ color: "#667085", fontSize: 13 }}>Drag a booking to another date to keep its local time, or use the reschedule fields. All moves are checked for conflicts.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {calendarDays.map((day) => (
            <section key={day.date} aria-label={`Appointments for ${day.date}`} onDragOver={(event) => { if (draggingId !== null) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (draggingId !== null) void dropOnDate(draggingId, day.date); setDraggingId(null); }} style={{ border: "1px solid #dbe3ef", borderRadius: 12, padding: 12, background: "#f8fafc", minHeight: 100 }}>
              <h3 style={{ margin: "2px 0 10px", fontSize: 15 }}>{displayDate(day.date)}</h3>
              {day.appointments.length === 0 && <p style={{ color: "#667085", fontSize: 13 }}>No bookings</p>}
              <ol style={{ display: "grid", gap: 10, listStyle: "none", padding: 0, margin: 0 }}>
          {day.appointments.map((appointment) => {
            const canManage = appointment.status === "booked" || appointment.status === "confirmed";
            const times = newTimes[appointment.appointment_id] ?? { start: "", end: "" };
            return (
              <li key={appointment.appointment_id} draggable={canManage} onDragStart={() => setDraggingId(appointment.appointment_id)} onDragEnd={() => setDraggingId(null)} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, background: "#fff", cursor: canManage ? "grab" : "default" }}>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 14 }}>
                  <div>
                    <h3 style={{ margin: "0 0 8px", fontSize: 17 }}>Appointment #{appointment.appointment_id} · {appointment.patient_name}</h3>
                    <p style={{ margin: "4px 0", color: "#344054" }}>{displayTime(appointment.slot_start)} – {new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", timeStyle: "short" }).format(new Date(appointment.slot_end))}</p>
                    <p style={{ margin: "4px 0", color: "#53627b" }}>Doctor: {appointment.doctor_name} · {appointment.mode === "online" ? "Online" : "In person"} · {appointment.status.replaceAll("_", " ")}</p>
                  </div>
                  {canManage && <button type="button" disabled={busyId !== null} onClick={() => void cancel(appointment.appointment_id)} style={{ ...field, color: "#a32020" }}>{busyId === appointment.appointment_id ? "Updating…" : "Cancel appointment"}</button>}
                </div>
                {canManage && (
                  <form onSubmit={(event) => { event.preventDefault(); void reschedule(appointment.appointment_id); }} style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 10, marginTop: 14 }}>
                    <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 600 }}>New start (IST)<input type="datetime-local" value={times.start} onChange={(event) => setNewTimes((current) => ({ ...current, [appointment.appointment_id]: { ...times, start: event.target.value } }))} required style={field} /></label>
                    <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 600 }}>New end (IST)<input type="datetime-local" value={times.end} onChange={(event) => setNewTimes((current) => ({ ...current, [appointment.appointment_id]: { ...times, end: event.target.value } }))} required style={field} /></label>
                    <button type="submit" disabled={busyId !== null} style={{ ...field, background: "#3157a4", color: "#fff", border: 0, fontWeight: 700 }}>{busyId === appointment.appointment_id ? "Updating…" : "Reschedule"}</button>
                  </form>
                )}
              </li>
            );
          })}
              </ol>
            </section>
          ))}
          </div>
        </>
      )}
    </section>
  );
}
