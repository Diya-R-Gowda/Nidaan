import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { requireRole } from "@/lib/auth";
import { pool } from "@/lib/db";

type ConsultationRequest = {
  appointment_id?: unknown;
  chief_complaint?: unknown;
  notes?: unknown;
  diagnosis?: unknown;
  started_at?: unknown;
  ended_at?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function GET() {
  return NextResponse.json({ resource: "consultations" });
}

function parseOptionalTimestamp(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

export async function POST(request: Request) {
  let userId: number;
  try {
    const authorization = await requireRole(["prescriber"]);
    if (authorization instanceof NextResponse) return authorization;
    userId = authorization.userId;
  } catch {
    return NextResponse.json(
      { error: "Unable to verify authorization" },
      { status: 500 },
    );
  }

  let body: ConsultationRequest;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    body = parsed as ConsultationRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const appointmentId = body.appointment_id;
  if (
    typeof appointmentId !== "number" ||
    !Number.isSafeInteger(appointmentId) ||
    appointmentId <= 0 ||
    appointmentId > 2_147_483_647
  ) {
    return NextResponse.json(
      { error: "appointment_id must be a positive integer" },
      { status: 400 },
    );
  }

  if (typeof body.chief_complaint !== "string" || !body.chief_complaint.trim()) {
    return NextResponse.json(
      { error: "chief_complaint is required" },
      { status: 400 },
    );
  }

  for (const field of ["notes", "diagnosis"] as const) {
    if (body[field] !== undefined && body[field] !== null && typeof body[field] !== "string") {
      return NextResponse.json(
        { error: `${field} must be a string or null` },
        { status: 400 },
      );
    }
  }

  const startedAt = parseOptionalTimestamp(body.started_at);
  const endedAt = parseOptionalTimestamp(body.ended_at);
  if (startedAt === undefined || endedAt === undefined) {
    return NextResponse.json(
      { error: "started_at and ended_at must be valid timestamp strings or null" },
      { status: 400 },
    );
  }

  let client: PoolClient | undefined;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const doctorResult = await client.query<{ doctor_id: number }>(
      `SELECT doctor.doctor_id
       FROM doctor
       JOIN user_account AS account ON account.user_id = doctor.user_id
       WHERE doctor.user_id = $1
         AND account.role = 'prescriber'
         AND account.is_active = TRUE
       FOR SHARE OF doctor`,
      [userId],
    );

    if (!doctorResult.rows[0]) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json(
        { error: "Prescriber profile not found" },
        { status: 403 },
      );
    }

    const appointmentResult = await client.query<{
      appointment_id: number;
      doctor_id: number;
      status: string;
    }>(
      `SELECT appointment_id, doctor_id, status
       FROM appointment
       WHERE appointment_id = $1
       FOR UPDATE`,
      [appointmentId],
    );

    const appointment = appointmentResult.rows[0];
    if (!appointment) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    if (appointment.doctor_id !== doctorResult.rows[0].doctor_id) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json(
        { error: "You are not authorized to record this consultation" },
        { status: 403 },
      );
    }

    if (!["booked", "confirmed"].includes(appointment.status)) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json(
        { error: "Appointment is not available for consultation" },
        { status: 409 },
      );
    }

    const existingResult = await client.query(
      `SELECT consultation_id
       FROM consultation
       WHERE appointment_id = $1`,
      [appointmentId],
    );
    if (existingResult.rows[0]) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json(
        { error: "A consultation is already recorded for this appointment" },
        { status: 409 },
      );
    }

    const result = await client.query(
      `INSERT INTO consultation
         (appointment_id, chief_complaint, notes, diagnosis, started_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING consultation_id, appointment_id, chief_complaint, notes,
                 diagnosis, started_at, ended_at`,
      [
        appointmentId,
        body.chief_complaint.trim(),
        body.notes ?? null,
        body.diagnosis ?? null,
        startedAt,
        endedAt,
      ],
    );

    await client.query(
      `UPDATE appointment
       SET status = 'completed'
       WHERE appointment_id = $1`,
      [appointmentId],
    );

    await client.query("COMMIT");
    transactionStarted = false;
    return NextResponse.json({ consultation: result.rows[0] }, { status: 201 });
  } catch {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Keep database details out of the API response.
      }
    }
    return NextResponse.json(
      { error: "Unable to create consultation" },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
