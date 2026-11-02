import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { requireRole } from "@/lib/auth";
import { pool } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type AppointmentRow = {
  appointment_id: number;
  doctor_id: number;
  status: "booked" | "confirmed" | "cancelled" | "completed" | "no_show";
  slot_start: Date | string;
  slot_end: Date | string;
};

export async function POST(_request: Request, { params }: RouteContext) {
  let userId: number;
  try {
    const authorization = await requireRole(["receptionist"]);
    if (authorization instanceof NextResponse) return authorization;
    userId = authorization.userId;
  } catch {
    return NextResponse.json(
      { error: "Unable to verify authorization" },
      { status: 500 },
    );
  }

  let appointmentId: number;
  try {
    const { id } = await params;
    if (!/^[1-9]\d*$/.test(id)) {
      return NextResponse.json({ error: "Invalid appointment ID" }, { status: 400 });
    }
    appointmentId = Number(id);
    if (!Number.isSafeInteger(appointmentId) || appointmentId > 2_147_483_647) {
      return NextResponse.json({ error: "Invalid appointment ID" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid appointment ID" }, { status: 400 });
  }

  let client: PoolClient | undefined;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    // Match appointment creation's snapshot semantics so the overlap check
    // observes bookings committed while this request waited on the doctor lock.
    await client.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await client.query(
      "SELECT set_config('nidaan.actor_user_id', $1, TRUE)",
      [String(userId)],
    );

    const initialResult = await client.query<{ doctor_id: number }>(
      `SELECT doctor_id
       FROM appointment
       WHERE appointment_id = $1`,
      [appointmentId],
    );
    const initial = initialResult.rows[0];
    if (!initial) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    // Booking and confirmation use the same stable serialization row.
    const doctorResult = await client.query<{ doctor_id: number }>(
      `SELECT d.doctor_id
       FROM doctor AS d
       JOIN user_account AS account ON account.user_id = d.user_id
       WHERE d.doctor_id = $1
         AND account.role = 'prescriber'
         AND account.is_active = TRUE
       FOR UPDATE OF d, account`,
      [initial.doctor_id],
    );
    if (!doctorResult.rows[0]) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json(
        { error: "Appointment doctor is not active" },
        { status: 409 },
      );
    }

    const appointmentResult = await client.query<AppointmentRow>(
      `SELECT appointment_id, doctor_id, status, slot_start, slot_end
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
        { error: "Appointment changed while it was being confirmed" },
        { status: 409 },
      );
    }

    if (appointment.status === "confirmed") {
      await client.query("COMMIT");
      transactionStarted = false;
      return NextResponse.json({ appointment });
    }
    if (appointment.status !== "booked" && appointment.status !== "cancelled") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json(
        { error: "Appointment cannot be confirmed from its current status" },
        { status: 409 },
      );
    }

    const overlapResult = await client.query(
      `SELECT 1
       FROM appointment
       WHERE doctor_id = $1
         AND appointment_id <> $2
         AND status IN ('booked', 'confirmed')
         AND tstzrange(slot_start, slot_end) && tstzrange($3::timestamptz, $4::timestamptz)
       FOR UPDATE`,
      [
        appointment.doctor_id,
        appointment.appointment_id,
        appointment.slot_start,
        appointment.slot_end,
      ],
    );
    if (overlapResult.rowCount && overlapResult.rowCount > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json(
        { error: "The appointment slot conflicts with another active appointment" },
        { status: 409 },
      );
    }

    const result = await client.query<AppointmentRow>(
      `UPDATE appointment
       SET status = 'confirmed'
       WHERE appointment_id = $1
         AND status IN ('booked', 'cancelled')
       RETURNING appointment_id, doctor_id, status, slot_start, slot_end`,
      [appointmentId],
    );

    await client.query("COMMIT");
    transactionStarted = false;
    return NextResponse.json({ appointment: result.rows[0] });
  } catch {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Keep database details out of the API response.
      }
    }
    return NextResponse.json(
      { error: "Unable to confirm appointment" },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
