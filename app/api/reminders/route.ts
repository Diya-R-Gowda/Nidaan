import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { pool } from "@/lib/db";

type ReminderRequest = {
  reminder_id?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET() {
  try {
    const authorization = await requireRole(["receptionist"]);
    if (authorization instanceof NextResponse) return authorization;
  } catch {
    return NextResponse.json(
      { error: "Unable to verify authorization" },
      { status: 500 },
    );
  }

  try {
    const result = await pool.query(
      `SELECT reminder_id, appointment_id, recipient_type, channel,
              scheduled_for, sent_at, status, attempts
       FROM vw_pending_reminders
       ORDER BY scheduled_for, reminder_id`,
    );

    return NextResponse.json({ reminders: result.rows });
  } catch {
    return NextResponse.json(
      { error: "Unable to load pending reminders" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await requireRole(["receptionist"]);
    if (authorization instanceof NextResponse) return authorization;
  } catch {
    return NextResponse.json(
      { error: "Unable to verify authorization" },
      { status: 500 },
    );
  }

  let body: ReminderRequest;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    body = parsed as ReminderRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reminderId = body.reminder_id;
  if (
    !Number.isSafeInteger(reminderId) ||
    (reminderId as number) <= 0 ||
    (reminderId as number) > 2_147_483_647
  ) {
    return NextResponse.json(
      { error: "reminder_id must be a positive integer" },
      { status: 400 },
    );
  }

  try {
    const result = await pool.query(
      `UPDATE reminder_queue
       SET sent_at = now(),
           status = 'sent',
           attempts = COALESCE(attempts, 0) + 1
       WHERE reminder_id = $1
         AND status = 'pending'
         AND sent_at IS NULL
       RETURNING reminder_id, appointment_id, recipient_type, channel,
                 scheduled_for, sent_at, status, attempts`,
      [reminderId],
    );

    if (result.rows[0]) {
      return NextResponse.json({ reminder: result.rows[0] });
    }

    const existing = await pool.query(
      `SELECT reminder_id, sent_at, status
       FROM reminder_queue
       WHERE reminder_id = $1`,
      [reminderId],
    );

    if (!existing.rows[0]) {
      return NextResponse.json(
        { error: "Reminder not found" },
        { status: 404 },
      );
    }

    if (existing.rows[0].sent_at !== null || existing.rows[0].status === "sent") {
      return NextResponse.json(
        { error: "Reminder has already been marked as sent" },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Reminder is not pending" },
      { status: 409 },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to update reminder" },
      { status: 500 },
    );
  }
}
