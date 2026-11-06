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

export async function POST(_request: Request, { params }: RouteContext) {
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

  let client: PoolClient | undefined;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
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
    if (current.status === "cancelled") {
      await client.query("COMMIT");
      transactionStarted = false;
      return NextResponse.json({ appointment: current, already_cancelled: true });
    }
    if (current.status !== "booked" && current.status !== "confirmed") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json({ error: "Only booked or confirmed appointments can be cancelled" }, { status: 409 });
    }

    const result = await client.query<Appointment>(
      `UPDATE appointment SET status = 'cancelled'
       WHERE appointment_id = $1 AND status IN ('booked', 'confirmed')
       RETURNING appointment_id, doctor_id, slot_start, slot_end, status`,
      [appointmentId],
    );
    await client.query(
      `UPDATE reminder_queue
       SET status = 'cancelled'
       WHERE appointment_id = $1 AND status = 'pending' AND sent_at IS NULL`,
      [appointmentId],
    );
    await client.query(
      `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'CANCEL', 'appointment', $2,
               jsonb_build_object('previous_status', $3::text, 'status', 'cancelled'))`,
      [userId, appointmentId, current.status],
    );
    await client.query("COMMIT");
    transactionStarted = false;
    return NextResponse.json({ appointment: result.rows[0] });
  } catch {
    if (client && transactionStarted) {
      try { await client.query("ROLLBACK"); } catch { /* Do not expose database errors. */ }
    }
    return NextResponse.json({ error: "Unable to cancel appointment" }, { status: 500 });
  } finally {
    client?.release();
  }
}
