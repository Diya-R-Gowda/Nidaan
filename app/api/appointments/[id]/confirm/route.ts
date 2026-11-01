import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { pool } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const authorization = await requireRole(["receptionist"]);
    if (authorization instanceof NextResponse) return authorization;
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
      return NextResponse.json(
        { error: "Invalid appointment ID" },
        { status: 400 },
      );
    }

    appointmentId = Number(id);
    if (!Number.isSafeInteger(appointmentId) || appointmentId > 2_147_483_647) {
      return NextResponse.json(
        { error: "Invalid appointment ID" },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid appointment ID" },
      { status: 400 },
    );
  }

  try {
    const result = await pool.query(
      `UPDATE appointment
       SET status = 'confirmed'
       WHERE appointment_id = $1
         AND status IN ('booked', 'cancelled', 'confirmed')
       RETURNING appointment_id, status, slot_start, slot_end`,
      [appointmentId],
    );

    if (result.rows[0]) {
      return NextResponse.json({ appointment: result.rows[0] });
    }

    const existing = await pool.query(
      `SELECT appointment_id, status
       FROM appointment
       WHERE appointment_id = $1`,
      [appointmentId],
    );

    if (!existing.rows[0]) {
      return NextResponse.json(
        { error: "Appointment not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { error: "Appointment cannot be confirmed from its current status" },
      { status: 409 },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to confirm appointment" },
      { status: 500 },
    );
  }
}
