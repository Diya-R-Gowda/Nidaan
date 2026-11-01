import { Suspense } from "react";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { pool } from "@/lib/db";

type ScheduleAppointment = {
  appointment_id: number;
  patient_id: number;
  patient_name: string;
  slot_start: Date | string;
  slot_end: Date | string;
  mode: "in_person" | "online";
  appointment_status: "booked" | "confirmed";
  consultation_id: number | null;
  consultation_started_at: Date | string | null;
  consultation_ended_at: Date | string | null;
};

const pageStyle = {
  minHeight: "100vh",
  background: "#f4f7fb",
  padding: "36px 20px 56px",
  color: "#172033",
};

const cardStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  background: "#fff",
  padding: "22px 24px",
  boxShadow: "0 12px 32px rgba(22, 34, 57, 0.04)",
};

function formatAppointmentTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function LoadingSchedule() {
  return (
    <p role="status" style={{ ...cardStyle, color: "#53627b" }}>
      Loading today&apos;s appointments…
    </p>
  );
}

async function TodaySchedule({ userId }: { userId: number }) {
  try {
    const doctorResult = await pool.query<{ doctor_id: number }>(
      `SELECT d.doctor_id
       FROM doctor AS d
       JOIN user_account AS account ON account.user_id = d.user_id
       WHERE d.user_id = $1
         AND account.role = 'prescriber'
         AND account.is_active = TRUE`,
      [userId],
    );
    const doctorId = doctorResult.rows[0]?.doctor_id;

    if (!doctorId) {
      return (
        <p role="alert" style={{ ...cardStyle, color: "#a32020" }}>
          Your active doctor profile could not be found. Contact an administrator.
        </p>
      );
    }

    const scheduleResult = await pool.query<ScheduleAppointment>(
      `WITH local_day AS (
         SELECT
           date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')
             AT TIME ZONE 'Asia/Kolkata' AS starts_at,
           (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') + INTERVAL '1 day')
             AT TIME ZONE 'Asia/Kolkata' AS ends_at
       )
       SELECT
         schedule.appointment_id,
         schedule.patient_id,
         schedule.patient_name,
         schedule.slot_start,
         schedule.slot_end,
         schedule.mode,
         schedule.appointment_status,
         schedule.consultation_id,
         schedule.consultation_started_at,
         schedule.consultation_ended_at
       FROM vw_doctor_schedule AS schedule
       CROSS JOIN local_day
       WHERE schedule.doctor_id = $1
         AND schedule.slot_start >= local_day.starts_at
         AND schedule.slot_start < local_day.ends_at
       ORDER BY schedule.slot_start, schedule.appointment_id`,
      [doctorId],
    );

    const appointments = scheduleResult.rows;

    return (
      <>
        <p style={{ margin: "0 0 18px", color: "#596579" }}>
          {appointments.length} upcoming {appointments.length === 1 ? "appointment" : "appointments"} today
          <span> · Times shown in India Standard Time</span>
        </p>
        {appointments.length === 0 ? (
          <section style={cardStyle}>
            <h2 style={{ margin: "0 0 8px", fontSize: 19 }}>No appointments today</h2>
            <p style={{ margin: 0, color: "#596579", lineHeight: 1.6 }}>
              You have no upcoming booked or confirmed appointments for today.
            </p>
          </section>
        ) : (
          <ol
            aria-label="Today's appointments"
            style={{ display: "grid", gap: 14, listStyle: "none", margin: 0, padding: 0 }}
          >
            {appointments.map((appointment) => (
              <li key={appointment.appointment_id}>
                <article style={cardStyle}>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "start",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div>
                      <p style={{ margin: "0 0 5px", color: "#3157a4", fontWeight: 700 }}>
                        {formatAppointmentTime(appointment.slot_start)} – {formatAppointmentTime(appointment.slot_end)}
                      </p>
                      <h2 style={{ margin: 0, fontSize: 20 }}>{appointment.patient_name}</h2>
                    </div>
                    <span
                      style={{
                        borderRadius: 999,
                        background: appointment.appointment_status === "confirmed" ? "#ecfdf3" : "#eff6ff",
                        color: appointment.appointment_status === "confirmed" ? "#067647" : "#1e40af",
                        padding: "6px 10px",
                        fontSize: 13,
                        fontWeight: 700,
                        textTransform: "capitalize",
                      }}
                    >
                      {appointment.appointment_status}
                    </span>
                  </div>
                  <dl
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: "12px 20px",
                      margin: "20px 0 0",
                    }}
                  >
                    <div>
                      <dt style={{ color: "#667085", fontSize: 12 }}>Appointment</dt>
                      <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>#{appointment.appointment_id}</dd>
                    </div>
                    <div>
                      <dt style={{ color: "#667085", fontSize: 12 }}>Mode</dt>
                      <dd style={{ margin: "4px 0 0", fontWeight: 600, textTransform: "capitalize" }}>
                        {appointment.mode.replace("_", " ")}
                      </dd>
                    </div>
                    <div>
                      <dt style={{ color: "#667085", fontSize: 12 }}>Consultation</dt>
                      <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>
                        {appointment.consultation_id ? `#${appointment.consultation_id}` : "Not started"}
                      </dd>
                    </div>
                  </dl>
                </article>
              </li>
            ))}
          </ol>
        )}
      </>
    );
  } catch {
    return (
      <p role="alert" style={{ ...cardStyle, color: "#a32020" }}>
        Today&apos;s appointments could not be loaded. Please try again later.
      </p>
    );
  }
}

export default async function DoctorPage() {
  const session = await readSession();

  if (!session) {
    redirect("/login");
  }
  if (session.role !== "prescriber") {
    redirect("/");
  }

  return (
    <main style={pageStyle}>
      <div style={{ width: "100%", maxWidth: 960, margin: "0 auto" }}>
        <header style={{ margin: "0 0 26px" }}>
          <p
            style={{
              margin: 0,
              color: "#53627b",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Doctor dashboard
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: 32, letterSpacing: "-0.03em" }}>
            Today&apos;s appointments
          </h1>
          <a
            href="/doctor/prescriptions"
            style={{
              display: "inline-block",
              marginTop: 16,
              borderRadius: 10,
              background: "#3157a4",
              color: "#fff",
              padding: "11px 16px",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Open prescription builder
          </a>
        </header>
        <Suspense fallback={<LoadingSchedule />}>
          <TodaySchedule userId={session.userId} />
        </Suspense>
      </div>
    </main>
  );
}
