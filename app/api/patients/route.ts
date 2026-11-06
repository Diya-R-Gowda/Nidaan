import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { requireRole } from "@/lib/auth";
import { pool } from "@/lib/db";

type PatientRequest = {
  full_name?: unknown;
  date_of_birth?: unknown;
  sex?: unknown;
  phone?: unknown;
  email?: unknown;
  blood_group?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDateOnly(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    return undefined;
  }
  return value.trim();
}

export async function POST(request: Request) {
  let userId: number;
  try {
    const authorization = await requireRole(["receptionist"]);
    if (authorization instanceof NextResponse) return authorization;
    userId = authorization.userId;
  } catch {
    return NextResponse.json({ error: "Unable to verify authorization" }, { status: 500 });
  }

  let body: PatientRequest;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    body = parsed as PatientRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fullName = optionalText(body.full_name, 120);
  const sex = optionalText(body.sex, 20);
  const phone = optionalText(body.phone, 30);
  const email = optionalText(body.email, 255);
  const bloodGroup = optionalText(body.blood_group, 10);
  if (fullName === undefined || !fullName) {
    return NextResponse.json({ error: "full_name is required and must be at most 120 characters" }, { status: 400 });
  }
  if (!isDateOnly(body.date_of_birth)) {
    return NextResponse.json({ error: "date_of_birth must be a valid YYYY-MM-DD date" }, { status: 400 });
  }
  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const todayValues = Object.fromEntries(todayParts.map((part) => [part.type, part.value]));
  const todayInIndia = `${todayValues.year}-${todayValues.month}-${todayValues.day}`;
  if (body.date_of_birth > todayInIndia) {
    return NextResponse.json({ error: "date_of_birth cannot be in the future" }, { status: 400 });
  }
  if (sex === undefined || !sex) {
    return NextResponse.json({ error: "sex is required and must be at most 20 characters" }, { status: 400 });
  }
  if (phone === undefined || !phone) {
    return NextResponse.json({ error: "phone is required and must be at most 30 characters" }, { status: 400 });
  }
  if (email === undefined) {
    return NextResponse.json({ error: "email must be a valid address of at most 255 characters" }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "email must be a valid email address" }, { status: 400 });
  }
  if (bloodGroup === undefined) {
    return NextResponse.json({ error: "blood_group must be at most 10 characters" }, { status: 400 });
  }

  let client: PoolClient | undefined;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query(
      "SELECT set_config('nidaan.actor_user_id', $1, TRUE)",
      [String(userId)],
    );

    // The schema has no patient email uniqueness constraint. Serialize API
    // registrations that provide an email and reject an existing match.
    if (email) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('patient-email:' || lower($1), 0))",
        [email],
      );
      const duplicate = await client.query(
        "SELECT patient_id FROM patient WHERE lower(email) = lower($1) LIMIT 1",
        [email],
      );
      if (duplicate.rows[0]) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return NextResponse.json(
          { error: "A patient with this email address is already registered" },
          { status: 409 },
        );
      }
    }

    const result = await client.query<{ patient_id: number; full_name: string }>(
      `INSERT INTO patient (full_name, date_of_birth, sex, phone, email, blood_group)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING patient_id, full_name`,
      [fullName, body.date_of_birth, sex, phone, email, bloodGroup],
    );
    const patient = result.rows[0];
    await client.query(
      `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'INSERT', 'patient', $2, '{}'::jsonb)`,
      [userId, patient.patient_id],
    );
    await client.query("COMMIT");
    transactionStarted = false;
    return NextResponse.json({ patient }, { status: 201 });
  } catch {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Keep database details out of the response.
      }
    }
    return NextResponse.json({ error: "Unable to register patient" }, { status: 500 });
  } finally {
    client?.release();
  }
}
