import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import AdeReportForm from "./AdeReportForm";

export const dynamic = "force-dynamic";

type PatientOption = { patient_id: number; full_name: string };
type ItemOption = {
  item_id: number;
  patient_name: string;
  drug_name: string;
  dose: string;
};

export default async function AdeReportPage() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "prescriber") redirect("/");

  let patients: PatientOption[] = [];
  let items: ItemOption[] = [];
  let loadError = "";

  try {
    const doctorResult = await pool.query<{ doctor_id: number }>(
      `SELECT d.doctor_id
       FROM doctor AS d
       JOIN user_account AS account ON account.user_id = d.user_id
       WHERE d.user_id = $1
         AND account.role = 'prescriber'
         AND account.is_active = TRUE`,
      [session.userId],
    );
    const doctorId = doctorResult.rows[0]?.doctor_id;
    if (!doctorId) {
      loadError = "Your active doctor profile could not be found. Contact an administrator.";
    } else {
      const [patientResult, itemResult] = await Promise.all([
        pool.query<PatientOption>(
          `SELECT DISTINCT patient.patient_id, patient.full_name
           FROM patient
           JOIN appointment ON appointment.patient_id = patient.patient_id
           WHERE appointment.doctor_id = $1
           ORDER BY patient.full_name, patient.patient_id`,
          [doctorId],
        ),
        pool.query<ItemOption>(
          `SELECT DISTINCT item.item_id, patient.full_name AS patient_name,
                  drug.drug_name, item.dose
           FROM prescription_item AS item
           JOIN drug ON drug.drug_id = item.drug_id
           JOIN prescription ON prescription.prescription_id = item.prescription_id
           JOIN consultation ON consultation.consultation_id = prescription.consultation_id
           JOIN appointment ON appointment.appointment_id = consultation.appointment_id
           JOIN patient ON patient.patient_id = appointment.patient_id
           WHERE appointment.doctor_id = $1
           ORDER BY patient.full_name, drug.drug_name, item.item_id`,
          [doctorId],
        ),
      ]);
      patients = patientResult.rows;
      items = itemResult.rows;
    }
  } catch {
    loadError = "Report options could not be loaded. Please try again later.";
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "36px 20px 56px", color: "#172033" }}>
      <div style={{ width: "100%", maxWidth: 820, margin: "0 auto" }}>
        <a href="/doctor" style={{ color: "#3157a4", fontSize: 14, fontWeight: 600 }}>← Doctor dashboard</a>
        <header style={{ margin: "22px 0 24px" }}>
          <p style={{ margin: 0, color: "#53627b", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Prescriber workspace</p>
          <h1 style={{ margin: "8px 0 0", fontSize: 32, letterSpacing: "-0.03em" }}>Report an adverse event</h1>
          <p style={{ margin: "10px 0 0", color: "#596579", lineHeight: 1.6 }}>Reports are limited to patients with appointments assigned to your doctor account. The server verifies this relationship again when submitted.</p>
        </header>

        {loadError ? <p role="alert" style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff", padding: 18, color: "#a32020" }}>{loadError}</p> : patients.length === 0 ? <p role="status" style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff", padding: 18, color: "#596579" }}>No patients are currently available through your appointments.</p> : (
          <section style={{ border: "1px solid #e2e8f0", borderRadius: 16, background: "#fff", padding: "24px clamp(18px, 5vw, 34px)", boxShadow: "0 12px 32px rgba(22, 34, 57, 0.05)" }}>
            <AdeReportForm patients={patients} items={items} />
          </section>
        )}
      </div>
    </main>
  );
}
