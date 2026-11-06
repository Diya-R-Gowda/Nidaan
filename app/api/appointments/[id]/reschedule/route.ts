import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { requireRole } from "@/lib/auth";
import { pool } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };
type Appointment = {
  appointment_id: number;
  doctor_id: number;
  slot_start: Date | string;
  slot_end: Date | string;
  status: string;
};

function parseId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 2_147_483_647 ? parsed : null;
}

function parseTimestamp(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) return null;
  const date = value.slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  ) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export async function POST(request: Request, { params }: RouteContext) {
  let userId: number;
  try {
    const authorization = await requireRole(["receptionist"]);
    if (authorization instanceof NextResponse) return authorization;
    userId = authorization.userId;
  } catch {
    return NextResponse.json({ error: "Unable to verify authorization" }, { status: 500 });
  }

  let appointmentId: number | null;
  try {
    appointmentId = parseId((await params).id);
  } catch {
    appointmentId = null;
  }
  if (appointmentId === null) {
    return NextResponse.json({ error: "Invalid appointment ID" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const slotStart = parseTimestamp(input.slot_start);
  const slotEnd = parseTimestamp(input.slot_end);
  if (!slotStart || !slotEnd || Date.parse(slotEnd) <= Date.parse(slotStart)) {
    return NextResponse.json(
      { error: "slot_start and slot_end must be valid timestamps with slot_end later" },
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
    await client.query("SELECT set_config('nidaan.actor_user_id', $1, TRUE)", [String(userId)]);

    const initial = await client.query<{ doctor_id: number }>(
      "SELECT doctor_id FROM appointment WHERE appointment_id = $1",
      [appointmentId],
    );
    if (!initial.rows[0]) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    const doctor = await client.query(
      `SELECT d.doctor_id
       FROM doctor AS d
       JOIN user_account AS account ON account.user_id = d.user_id
       WHERE d.doctor_id = $1
         AND account.role = 'prescriber'
         AND account.is_active = TRUE
       FOR UPDATE OF d, account`,
      [initial.rows[0].doctor_id],
    );
    if (!doctor.rows[0]) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json({ error: "Appointment doctor is not active" }, { status: 409 });
    }

    const currentResult = await client.query<Appointment>(
      `SELECT appointment_id, doctor_id, slot_start, slot_end, status
       FROM appointment WHERE appointment_id = $1 FOR UPDATE`,
      [appointmentId],
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }
    if (current.doctor_id !== doctor.rows[0].doctor_id) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json({ error: "Appointment changed; reload and try again" }, { status: 409 });
    }
    if (current.status !== "booked" && current.status !== "confirmed") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json({ error: "Only booked or confirmed appointments can be rescheduled" }, { status: 409 });
    }

    const overlap = await client.query(
      `SELECT 1
       FROM appointment AS a
       WHERE a.doctor_id = $1
         AND a.appointment_id <> $2
         AND a.status IN ('booked', 'confirmed')
         AND tstzrange(a.slot_start, a.slot_end) && tstzrange($3::timestamptz, $4::timestamptz)
       FOR UPDATE OF a`,
      [current.doctor_id, appointmentId, slotStart, slotEnd],
    );
    if (overlap.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json({ error: "The requested appointment slot conflicts with another active appointment" }, { status: 409 });
    }

    const updated = await client.query<Appointment>(
      `UPDATE appointment
       SET slot_start = $2, slot_end = $3
       WHERE appointment_id = $1
       RETURNING appointment_id, doctor_id, slot_start, slot_end, status`,
      [appointmentId, slotStart, slotEnd],
    );
    await client.query(
      `UPDATE reminder_queue
       SET scheduled_for = $2::timestamptz - INTERVAL '24 hours'
       WHERE appointment_id = $1 AND status = 'pending' AND sent_at IS NULL`,
      [appointmentId, slotStart],
    );
    await client.query(
      `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'RESCHEDULE', 'appointment', $2,
               jsonb_build_object('previous_slot_start', $3::text,
                                  'previous_slot_end', $4::text,
                                  'slot_start', $5::text,
                                  'slot_end', $6::text))`,
      [userId, appointmentId, current.slot_start, current.slot_end, slotStart, slotEnd],
    );

    await client.query("COMMIT");
    transactionStarted = false;
    return NextResponse.json({ appointment: updated.rows[0] });
  } catch {
    if (client && transactionStarted) {
      try { await client.query("ROLLBACK"); } catch { /* Do not expose database errors. */ }
    }
    return NextResponse.json({ error: "Unable to reschedule appointment" }, { status: 500 });
  } finally {
    client?.release();
  }
}
