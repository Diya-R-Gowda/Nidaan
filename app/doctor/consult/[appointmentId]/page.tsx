import { notFound, redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import ConsultationForm from "./ConsultationForm";

export const dynamic = "force-dynamic";

interface ConsultationPageProps {
  params: Promise<{ appointmentId: string }>;
}

export default async function ConsultationPage({ params }: ConsultationPageProps) {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "prescriber") redirect("/");

  const { appointmentId } = await params;
  if (!/^[1-9]\d*$/.test(appointmentId)) notFound();
  const numericAppointmentId = Number(appointmentId);
  if (!Number.isSafeInteger(numericAppointmentId) || numericAppointmentId > 2_147_483_647) {
    notFound();
  }

  const assigned = await pool.query<{
    appointment_id: number;
    consultation_id: number | null;
  }>(
    `SELECT appointment.appointment_id,
            consultation.consultation_id
     FROM appointment
     JOIN doctor ON doctor.doctor_id = appointment.doctor_id
     LEFT JOIN consultation ON consultation.appointment_id = appointment.appointment_id
     WHERE appointment.appointment_id = $1
       AND doctor.user_id = $2`,
    [numericAppointmentId, session.userId],
  );
  if (!assigned.rows[0]) notFound();

  return (
    <ConsultationForm
      appointmentId={numericAppointmentId}
      existingConsultationId={assigned.rows[0].consultation_id ?? undefined}
    />
  );
}
