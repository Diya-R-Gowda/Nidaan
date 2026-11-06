import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import ReminderPanel from "./ReminderPanel";

export const dynamic = "force-dynamic";

export default async function ReceptionPage() {
  const session = await readSession();

  if (!session) {
    redirect("/login");
  }
  if (session.role !== "receptionist") {
    redirect("/");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f4f7fb",
        padding: "36px 20px 56px",
        color: "#172033",
      }}
    >
      <div style={{ width: "100%", maxWidth: 1040, margin: "0 auto" }}>
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
            Front desk
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: 32, letterSpacing: "-0.03em" }}>
            Reception dashboard
          </h1>
          <p style={{ margin: "10px 0 0", color: "#596579", lineHeight: 1.6 }}>
            Review reminders due soon or book an appointment.
          </p>
          <nav
            aria-label="Receptionist actions"
            style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}
          >
            <a
              href="/reception/calendar"
              style={{
                display: "inline-flex",
                minHeight: 44,
                alignItems: "center",
                border: "1px solid #3157a4",
                borderRadius: 10,
                background: "#fff",
                color: "#3157a4",
                padding: "10px 16px",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Appointment calendar
            </a>
            <a
              href="/reception/patients/new"
              style={{
                display: "inline-flex",
                minHeight: 44,
                alignItems: "center",
                border: "1px solid #3157a4",
                borderRadius: 10,
                background: "#fff",
                color: "#3157a4",
                padding: "10px 16px",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Register patient
            </a>
            <a
              href="/reception/book"
              style={{
                display: "inline-flex",
                minHeight: 44,
                alignItems: "center",
                borderRadius: 10,
                background: "#3157a4",
                color: "#fff",
                padding: "10px 16px",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Book an appointment
            </a>
            <a
              href="/reception/billing"
              style={{
                display: "inline-flex",
                minHeight: 44,
                alignItems: "center",
                border: "1px solid #3157a4",
                borderRadius: 10,
                background: "#fff",
                color: "#3157a4",
                padding: "10px 16px",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Billing
            </a>
          </nav>
        </header>
        <ReminderPanel />
      </div>
    </main>
  );
}
