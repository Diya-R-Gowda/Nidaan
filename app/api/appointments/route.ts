import { NextRequest, NextResponse } from "next/server";
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

function isPositiveInt32(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 2_147_483_647
  );
}

export async function GET(request: NextRequest) {
  let session: Session;
  try {
    const authorization = await requireRole(["receptionist", "prescriber"]);
    if (authorization instanceof NextResponse) return authorization;
    session = authorization;
  } catch {
    return NextResponse.json(
      { error: "Unable to verify authorization" },
      { status: 500 },
    );
  }

  const params = request.nextUrl.searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const limitValue = params.get("limit");
  const offsetValue = params.get("offset");
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  const isValidDate = (value: string) =>
    isoDate.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

  let fromDate = from;
  let toDate = to;
  if (fromDate === null && toDate === null) {
    const dateParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const dateValues = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));
    const today = `${dateValues.year}-${dateValues.month}-${dateValues.day}`;
    const year = Number(dateValues.year);
    const month = Number(dateValues.month);
    const day = Number(dateValues.day);
    const start = new Date(Date.UTC(year, month - 1, day));
    const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
    fromDate = today;
    toDate = end.toISOString().slice(0, 10);
  }

  if (
    fromDate === null ||
    toDate === null ||
    !isValidDate(fromDate) ||
    !isValidDate(toDate)
  ) {
    return NextResponse.json(
      { error: "from and to must be valid YYYY-MM-DD dates" },
      { status: 400 },
    );
  }

  const startMs = Date.parse(`${fromDate}T00:00:00Z`);
  const endMs = Date.parse(`${toDate}T00:00:00Z`);
  const dayCount = (endMs - startMs) / (24 * 60 * 60 * 1000);
  if (dayCount < 0 || dayCount > 30) {
    return NextResponse.json(
      { error: "Date range must be ordered and no longer than 31 days" },
      { status: 400 },
    );
  }

  const limit = limitValue === null ? 100 : /^\d+$/.test(limitValue) ? Number(limitValue) : NaN;
  const offset = offsetValue === null ? 0 : /^\d+$/.test(offsetValue) ? Number(offsetValue) : NaN;
  if (
    !Number.isInteger(limit) || limit < 1 || limit > 200 ||
    !Number.isInteger(offset) || offset < 0 || offset > 1_000_000
  ) {
    return NextResponse.json(
      { error: "limit must be 1–200 and offset must be a non-negative integer" },
      { status: 400 },
    );
  }

  try {
    let doctorId: number | null = null;
    if (session.role === "prescriber") {
      const doctor = await pool.query<{ doctor_id: number }>(
        `SELECT doctor_id
         FROM doctor
         WHERE user_id = $1`,
        [session.userId],
      );
      if (!doctor.rows[0]) {
        return NextResponse.json({ error: "Prescriber profile not found" }, { status: 403 });
      }
      doctorId = doctor.rows[0].doctor_id;
    }

    const result = await pool.query(
      `SELECT a.appointment_id,
              a.slot_start,
              a.slot_end,
              a.mode,
              a.status,
              p.full_name AS patient_name,
              d.doctor_id,
              account.full_name AS doctor_name
       FROM appointment AS a
       JOIN patient AS p ON p.patient_id = a.patient_id
       JOIN doctor AS d ON d.doctor_id = a.doctor_id
       JOIN user_account AS account ON account.user_id = d.user_id
       WHERE a.slot_start >= ($1::date::timestamp AT TIME ZONE 'Asia/Kolkata')
         AND a.slot_start < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
         AND ($3::int IS NULL OR a.doctor_id = $3)
       ORDER BY a.slot_start, a.appointment_id
       LIMIT $4 OFFSET $5`,
      [fromDate, toDate, doctorId, limit + 1, offset],
    );
    const hasMore = result.rows.length > limit;
    return NextResponse.json({
      appointments: result.rows.slice(0, limit),
      pagination: { limit, offset, has_more: hasMore },
      date_range: { from: fromDate, to: toDate, time_zone: "Asia/Kolkata" },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to load appointments" },
      { status: 500 },
    );
  }
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
  if (!isPositiveInt32(patient_id) || !isPositiveInt32(doctor_id)) {
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
    await client.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await client.query(
      "SELECT set_config('nidaan.actor_user_id', $1, TRUE)",
      [String(session.userId)],
    );

    // Lock this stable parent row first: locking matching appointments alone
    // cannot serialize the first booking when no overlapping row exists yet.
    const doctorResult = await client.query(
      `SELECT d.doctor_id
       FROM doctor AS d
       JOIN user_account AS account ON account.user_id = d.user_id
       WHERE d.doctor_id = $1
         AND account.role = 'prescriber'
         AND account.is_active = TRUE
       FOR UPDATE OF d, account`,
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
