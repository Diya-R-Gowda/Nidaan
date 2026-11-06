import { Suspense } from "react";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import PrescriptionBuilder from "./PrescriptionBuilder";

type ConsultationOptionRow = {
  consultation_id: number;
  appointment_id: number;
  slot_start: Date | string;
};

type DrugOption = {
  drug_id: number;
  drug_name: string;
  generic_name: string;
  form: string;
  strength: string;
};

type ConsultationOption = {
  consultation_id: number;
  appointment_id: number;
  appointment_time: string;
};

type PrescriptionsPageProps = {
  searchParams: Promise<{ consultationId?: string | string[] }>;
};

const mainStyle = {
  minHeight: "100vh",
  background: "#f4f7fb",
  padding: "36px 20px 56px",
  color: "#172033",
};

const cardStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  background: "#fff",
  padding: "24px clamp(20px, 5vw, 36px)",
  boxShadow: "0 12px 32px rgba(22, 34, 57, 0.05)",
};

function formatAppointmentTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function LoadingBuilder() {
  return (
    <p role="status" style={{ ...cardStyle, color: "#53627b" }}>
      Loading your consultations and active drugs…
    </p>
  );
}

async function BuilderOptions({
  userId,
  requestedConsultationId,
}: {
  userId: number;
  requestedConsultationId?: number;
}) {
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
        <PrescriptionBuilder
          consultations={[]}
          drugs={[]}
          loadError="Your active doctor profile could not be found. Contact an administrator."
        />
      );
    }

    const [consultationResult, drugResult] = await Promise.all([
      pool.query<ConsultationOptionRow>(
        `SELECT c.consultation_id, c.appointment_id, a.slot_start
         FROM consultation AS c
         JOIN appointment AS a ON a.appointment_id = c.appointment_id
         WHERE a.doctor_id = $1
         ORDER BY COALESCE(c.started_at, a.slot_start) DESC,
                  c.consultation_id DESC`,
        [doctorId],
      ),
      pool.query<DrugOption>(
        `SELECT drug_id, drug_name, generic_name, form, strength
         FROM drug
         WHERE is_active = TRUE
         ORDER BY drug_name, generic_name, strength, drug_id`,
      ),
    ]);

    const consultations: ConsultationOption[] = consultationResult.rows.map(
      (consultation) => ({
        consultation_id: consultation.consultation_id,
        appointment_id: consultation.appointment_id,
        appointment_time: formatAppointmentTime(consultation.slot_start),
      }),
    );
    const initialConsultationId = consultations.some(
      (consultation) => consultation.consultation_id === requestedConsultationId,
    )
      ? requestedConsultationId
      : undefined;

    return (
      <PrescriptionBuilder
        consultations={consultations}
        drugs={drugResult.rows}
        initialConsultationId={initialConsultationId}
      />
    );
  } catch {
    return (
      <PrescriptionBuilder
        consultations={[]}
        drugs={[]}
        loadError="Prescription options could not be loaded. Please try again later."
      />
    );
  }
}

function parseConsultationId(value: string | string[] | undefined): number | undefined {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : undefined;
}

export default async function PrescriptionsPage({
  searchParams,
}: PrescriptionsPageProps) {
  const [session, search] = await Promise.all([readSession(), searchParams]);

  if (!session) {
    redirect("/login");
  }
  if (session.role !== "prescriber") {
    redirect("/");
  }

  return (
    <main style={mainStyle}>
      <div style={{ width: "100%", maxWidth: 900, margin: "0 auto" }}>
        <header style={{ margin: "0 0 24px" }}>
          <a
            href="/doctor"
            style={{ color: "#3157a4", fontSize: 14, fontWeight: 600 }}
          >
            ← Doctor dashboard
          </a>
          <p
            style={{
              margin: "22px 0 0",
              color: "#53627b",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Prescriber workspace
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: 32, letterSpacing: "-0.03em" }}>
            Prescription builder
          </h1>
          <p style={{ margin: "10px 0 0", color: "#596579", lineHeight: 1.6 }}>
            Choose one of your consultations, then add its prescribed medicines.
          </p>
        </header>
        <Suspense fallback={<LoadingBuilder />}>
          <BuilderOptions
            userId={session.userId}
            requestedConsultationId={parseConsultationId(search.consultationId)}
          />
        </Suspense>
      </div>
    </main>
  );
}
