import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { pool } from "@/lib/db";
import { requireRole, type Session } from "@/lib/auth";

type AppointmentRequest = {
  patient_id: unknown;
  doctor_id: unknown;
  slot_start: unknown;
  slot_end: unknown;
  mode: unknown;
  meeting_link?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function GET() {
  return NextResponse.json({ resource: "appointments" });
}

export async function POST(request: Request) {
  let session: Session;

  try {
    const authorization = await requireRole(["receptionist"]);
    if (authorization instanceof NextResponse) return authorization;
    session = authorization;
  } catch {
    return NextResponse.json(
      { error: "Unable to verify authorization" },
      { status: 500 },
    );
  }

  let body: AppointmentRequest;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    body = parsed as unknown as AppointmentRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { patient_id, doctor_id, slot_start, slot_end, mode, meeting_link } = body;
  if (
    !Number.isInteger(patient_id) ||
    (patient_id as number) <= 0 ||
    !Number.isInteger(doctor_id) ||
    (doctor_id as number) <= 0
  ) {
    return NextResponse.json(
      { error: "patient_id and doctor_id must be positive integers" },
      { status: 400 },
    );
  }

  if (typeof slot_start !== "string" || typeof slot_end !== "string") {
    return NextResponse.json(
      { error: "slot_start and slot_end must be timestamp strings" },
      { status: 400 },
    );
  }

  const startTime = Date.parse(slot_start);
  const endTime = Date.parse(slot_end);
  if (
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    endTime <= startTime
  ) {
    return NextResponse.json(
      { error: "slot_end must be a valid timestamp later than slot_start" },
      { status: 400 },
    );
  }

  if (mode !== "in_person" && mode !== "online") {
    return NextResponse.json({ error: "Invalid appointment mode" }, { status: 400 });
  }

  let normalizedMeetingLink: string | null = null;
  if (mode === "online") {
    if (typeof meeting_link !== "string" || meeting_link.trim().length === 0) {
      return NextResponse.json(
        { error: "meeting_link is required for online appointments" },
        { status: 400 },
      );
    }
    normalizedMeetingLink = meeting_link.trim();
  } else if (meeting_link !== undefined && meeting_link !== null) {
    return NextResponse.json(
      { error: "meeting_link must be omitted for in-person appointments" },
      { status: 400 },
    );
  }

  let client: PoolClient | undefined;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    // Lock this stable parent row first: locking matching appointments alone
    // cannot serialize the first booking when no overlapping row exists yet.
    const doctorResult = await client.query(
      `SELECT d.doctor_id
       FROM doctor AS d
       JOIN user_account AS account ON account.user_id = d.user_id
       WHERE d.doctor_id = $1
         AND account.role = 'prescriber'
         AND account.is_active = TRUE
       FOR UPDATE OF d`,
      [doctor_id],
    );
    if (doctorResult.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json(
        { error: "Doctor not found or inactive" },
        { status: 404 },
      );
    }

    const patientResult = await client.query(
      "SELECT patient_id FROM patient WHERE patient_id = $1",
      [patient_id],
    );
    if (patientResult.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const overlapResult = await client.query(
      `SELECT 1
       FROM appointment
       WHERE doctor_id = $1
         AND status IN ('booked', 'confirmed')
         AND tstzrange(slot_start, slot_end) && tstzrange($2::timestamptz, $3::timestamptz)
       FOR UPDATE`,
      [
        doctor_id,
        new Date(startTime).toISOString(),
        new Date(endTime).toISOString(),
      ],
    );
    if (overlapResult.rowCount && overlapResult.rowCount > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json(
        { error: "The requested appointment slot is unavailable" },
        { status: 409 },
      );
    }

    const insertResult = await client.query(
      `INSERT INTO appointment
         (patient_id, doctor_id, created_by, slot_start, slot_end, mode, meeting_link, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'booked')
       RETURNING appointment_id, patient_id, doctor_id, created_by,
                 slot_start, slot_end, mode, meeting_link, status, created_at`,
      [
        patient_id,
        doctor_id,
        session.userId,
        new Date(startTime).toISOString(),
        new Date(endTime).toISOString(),
        mode,
        normalizedMeetingLink,
      ],
    );

    await client.query("COMMIT");
    transactionStarted = false;
    return NextResponse.json({ appointment: insertResult.rows[0] }, { status: 201 });
  } catch {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original failure and avoid exposing database details.
      }
    }
    return NextResponse.json(
      { error: "Unable to create appointment" },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
