import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import ReceptionCalendar from "@/app/reception/Calendar";

export const dynamic = "force-dynamic";

export default async function ReceptionCalendarPage() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "receptionist") redirect("/");

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", color: "#172033", padding: "32px 18px 56px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <a href="/reception" style={{ color: "#3157a4", fontWeight: 600 }}>← Reception</a>
        <header style={{ margin: "22px 0" }}>
          <h1 style={{ margin: 0, fontSize: 32 }}>Appointments</h1>
          <p style={{ color: "#53627b", lineHeight: 1.6 }}>Review the schedule, move eligible bookings, or cancel them. Dates and times use India Standard Time.</p>
        </header>
        <ReceptionCalendar />
      </div>
    </main>
  );
}
