import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import GenerateInvoiceButton from "./GenerateInvoiceButton";

export const dynamic = "force-dynamic";

type BillableConsultation = {
  consultation_id: number;
  patient_name: string;
  doctor_name: string;
  slot_start: Date | string;
};

const cardStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  background: "#fff",
  padding: "22px clamp(18px, 4vw, 28px)",
  boxShadow: "0 12px 32px rgba(22, 34, 57, 0.04)",
};

function formatTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function BillingPage() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "receptionist") redirect("/");

  let consultations: BillableConsultation[] = [];
  let loadError = "";
  try {
    const result = await pool.query<BillableConsultation>(
      `SELECT consultation.consultation_id,
              patient.full_name AS patient_name,
              account.full_name AS doctor_name,
              appointment.slot_start
       FROM consultation
       JOIN appointment ON appointment.appointment_id = consultation.appointment_id
       JOIN patient ON patient.patient_id = appointment.patient_id
       JOIN doctor ON doctor.doctor_id = appointment.doctor_id
       JOIN user_account AS account ON account.user_id = doctor.user_id
       WHERE appointment.status = 'completed'
         AND NOT EXISTS (
           SELECT 1 FROM invoice
           WHERE invoice.consultation_id = consultation.consultation_id
         )
       ORDER BY appointment.slot_start DESC, consultation.consultation_id DESC`,
    );
    consultations = result.rows;
  } catch {
    loadError = "Completed consultations could not be loaded. Please try again later.";
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "36px 20px 56px", color: "#172033" }}>
      <div style={{ width: "100%", maxWidth: 1040, margin: "0 auto" }}>
        <a href="/reception" style={{ color: "#3157a4", fontSize: 14, fontWeight: 600 }}>← Reception dashboard</a>
        <header style={{ margin: "22px 0 24px" }}>
          <p style={{ margin: 0, color: "#53627b", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Front desk</p>
          <h1 style={{ margin: "8px 0 0", fontSize: 32, letterSpacing: "-0.03em" }}>Billing</h1>
          <p style={{ margin: "10px 0 0", color: "#596579", lineHeight: 1.6 }}>Generate itemised invoices for completed consultations. Totals and line items are calculated by the database.</p>
        </header>

        <section aria-labelledby="billable-list-title" style={cardStyle}>
          <h2 id="billable-list-title" style={{ margin: "0 0 16px", fontSize: 20 }}>Completed consultations without invoices</h2>
          {loadError ? <p role="alert" style={{ color: "#a32020" }}>{loadError}</p> : consultations.length === 0 ? <p role="status" style={{ color: "#596579" }}>There are no completed consultations awaiting an invoice.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 680, borderCollapse: "collapse" }}>
                <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0, 0, 0, 0)" }}>Completed consultations eligible for invoice generation.</caption>
                <thead><tr style={{ textAlign: "left", color: "#53627b", fontSize: 13 }}>{["Consultation", "Patient", "Doctor", "Appointment time", "Action"].map((heading) => <th key={heading} scope="col" style={{ padding: "11px 12px", borderBottom: "1px solid #e2e8f0" }}>{heading}</th>)}</tr></thead>
                <tbody>{consultations.map((consultation) => (
                  <tr key={consultation.consultation_id}>
                    <td style={{ padding: 12, borderBottom: "1px solid #f0f2f5" }}>#{consultation.consultation_id}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f0f2f5" }}>{consultation.patient_name}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f0f2f5" }}>{consultation.doctor_name}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f0f2f5", whiteSpace: "nowrap" }}>{formatTime(consultation.slot_start)} IST</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f0f2f5" }}>
                      <GenerateInvoiceButton consultationId={consultation.consultation_id} />
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
