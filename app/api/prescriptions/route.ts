import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { requireRole } from "@/lib/auth";
import { pool } from "@/lib/db";

type PrescriptionRequest = {
  consultation_id?: unknown;
  notes?: unknown;
  items?: unknown;
};

type PrescriptionItemRequest = {
  drug_id: number;
  dose: string;
  frequency: string;
  duration_days: number;
  quantity: number;
};

type PrescriptionRecord = {
  prescription_id: number;
  consultation_id: number;
  issued_at: Date;
  notes: string | null;
};

type PrescriptionItemRecord = PrescriptionItemRequest & {
  item_id: number;
  prescription_id: number;
};

type InteractionAlertRecord = {
  alert_id: number;
  item_id: number;
  conflicting_item_id: number;
  severity: string;
  message: string;
  raised_at: Date;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 2_147_483_647
  );
}

export function GET() {
  return NextResponse.json({ resource: "prescriptions" });
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

  let body: PrescriptionRequest;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    body = parsed as PrescriptionRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const consultationId = body.consultation_id;
  if (!isPositiveInteger(consultationId)) {
    return NextResponse.json(
      { error: "consultation_id must be a positive integer" },
      { status: 400 },
    );
  }

  if (
    body.notes !== undefined &&
    body.notes !== null &&
    typeof body.notes !== "string"
  ) {
    return NextResponse.json(
      { error: "notes must be a string or null" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: "items must be a non-empty array" },
      { status: 400 },
    );
  }

  const items: PrescriptionItemRequest[] = [];
  for (let index = 0; index < body.items.length; index += 1) {
    const input = body.items[index];
    if (!isRecord(input)) {
      return NextResponse.json(
        { error: `items[${index}] must be an object` },
        { status: 400 },
      );
    }

    const { drug_id, dose, frequency, duration_days, quantity } = input;
    if (!isPositiveInteger(drug_id)) {
      return NextResponse.json(
        { error: `items[${index}].drug_id must be a positive integer` },
        { status: 400 },
      );
    }
    if (
      typeof dose !== "string" ||
      dose.trim().length === 0 ||
      Array.from(dose.trim()).length > 120
    ) {
      return NextResponse.json(
        { error: `items[${index}].dose must be 1 to 120 characters` },
        { status: 400 },
      );
    }
    if (
      typeof frequency !== "string" ||
      frequency.trim().length === 0 ||
      Array.from(frequency.trim()).length > 120
    ) {
      return NextResponse.json(
        { error: `items[${index}].frequency must be 1 to 120 characters` },
        { status: 400 },
      );
    }
    if (!isPositiveInteger(duration_days)) {
      return NextResponse.json(
        { error: `items[${index}].duration_days must be a positive integer` },
        { status: 400 },
      );
    }
    if (!isPositiveInteger(quantity)) {
      return NextResponse.json(
        { error: `items[${index}].quantity must be a positive integer` },
        { status: 400 },
      );
    }

    items.push({
      drug_id,
      dose: dose.trim(),
      frequency: frequency.trim(),
      duration_days,
      quantity,
    });
  }

  let client: PoolClient | undefined;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const doctorResult = await client.query<{ doctor_id: number }>(
      `SELECT d.doctor_id
       FROM doctor AS d
       JOIN user_account AS account ON account.user_id = d.user_id
       WHERE d.user_id = $1
         AND account.role = 'prescriber'
         AND account.is_active = TRUE
       FOR SHARE OF d, account`,
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

    const consultationResult = await client.query<{
      consultation_id: number;
      doctor_id: number;
    }>(
      `SELECT c.consultation_id, a.doctor_id
       FROM consultation AS c
       JOIN appointment AS a ON a.appointment_id = c.appointment_id
       WHERE c.consultation_id = $1
       FOR UPDATE OF c, a`,
      [consultationId],
    );
    const consultation = consultationResult.rows[0];
    if (!consultation) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json(
        { error: "Consultation not found" },
        { status: 404 },
      );
    }
    if (consultation.doctor_id !== doctorResult.rows[0].doctor_id) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json(
        { error: "You are not authorized to prescribe for this consultation" },
        { status: 403 },
      );
    }

    const uniqueDrugIds = [...new Set(items.map((item) => item.drug_id))];
    const availableDrugs = await client.query<{ drug_id: number }>(
      `SELECT drug_id
       FROM drug
       WHERE drug_id = ANY($1::int[])
         AND is_active = TRUE
       FOR SHARE`,
      [uniqueDrugIds],
    );
    if (availableDrugs.rowCount !== uniqueDrugIds.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json(
        { error: "One or more selected drugs are unavailable" },
        { status: 400 },
      );
    }

    const prescriptionResult = await client.query<PrescriptionRecord>(
      `INSERT INTO prescription (consultation_id, notes)
       VALUES ($1, $2)
       RETURNING prescription_id, consultation_id, issued_at, notes`,
      [consultationId, body.notes ?? null],
    );
    const prescription = prescriptionResult.rows[0];
    const insertedItems: PrescriptionItemRecord[] = [];

    for (const item of items) {
      const itemResult = await client.query<PrescriptionItemRecord>(
        `INSERT INTO prescription_item
           (prescription_id, drug_id, dose, frequency, duration_days, quantity)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING item_id, prescription_id, drug_id, dose, frequency,
                   duration_days, quantity`,
        [
          prescription.prescription_id,
          item.drug_id,
          item.dose,
          item.frequency,
          item.duration_days,
          item.quantity,
        ],
      );
      insertedItems.push(itemResult.rows[0]);
    }

    const alertResult = await client.query<InteractionAlertRecord>(
      `SELECT ia.alert_id, ia.item_id, ia.conflicting_item_id,
              ia.severity, ia.message, ia.raised_at
       FROM interaction_alert AS ia
       WHERE ia.item_id IN (
           SELECT pi.item_id
           FROM prescription_item AS pi
           WHERE pi.prescription_id = $1
       )
          OR ia.conflicting_item_id IN (
           SELECT pi.item_id
           FROM prescription_item AS pi
           WHERE pi.prescription_id = $1
       )
       ORDER BY ia.raised_at, ia.alert_id`,
      [prescription.prescription_id],
    );

    await client.query("COMMIT");
    transactionStarted = false;
    return NextResponse.json(
      {
        prescription,
        items: insertedItems,
        interaction_alerts: alertResult.rows,
      },
      { status: 201 },
    );
  } catch {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Keep database details out of the API response.
      }
    }
    return NextResponse.json(
      { error: "Unable to create prescription" },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
