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
          <a
            href="/reception/book"
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
            Book an appointment
          </a>
        </header>
        <ReminderPanel />
      </div>
    </main>
  );
}
