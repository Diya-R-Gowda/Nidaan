import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { requireRole } from "@/lib/auth";
import { pool } from "@/lib/db";

type PrescriptionRequest = {
  action?: unknown;
  consultation_id?: unknown;
  notes?: unknown;
  items?: unknown;
  interaction_review_token?: unknown;
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

type InteractionPreview = {
  item_ordinal: number;
  conflicting_item_ordinal: number | null;
  conflicting_item_id: number | null;
  item_drug_id: number;
  conflicting_drug_id: number;
  item_drug_name: string;
  conflicting_drug_name: string;
  severity: string;
  message: string;
};

type InteractionAlertRecord = {
  alert_id: number;
  item_id: number;
  conflicting_item_id: number;
  severity: string;
  message: string;
  raised_at: Date;
};

type ReviewTokenPayload = {
  userId: number;
  consultationId: number;
  requestHash: string;
  alertsHash: string;
  expiresAt: number;
};

const REVIEW_TOKEN_TTL_MS = 10 * 60 * 1000;

const INTERACTION_QUERY = `
  WITH proposed AS (
    SELECT drug_id, item_ordinal::int AS item_ordinal
    FROM unnest($2::int[]) WITH ORDINALITY AS input(drug_id, item_ordinal)
  ), active_medications AS (
    SELECT pi.item_id, pi.drug_id
    FROM prescription_item AS pi
    JOIN prescription AS p ON p.prescription_id = pi.prescription_id
    JOIN consultation AS c ON c.consultation_id = p.consultation_id
    JOIN appointment AS a ON a.appointment_id = c.appointment_id
    WHERE a.patient_id = $1
      AND p.issued_at <= CURRENT_TIMESTAMP
      AND p.issued_at + (pi.duration_days * INTERVAL '1 day') > CURRENT_TIMESTAMP
  ), matches AS (
    SELECT proposed.item_ordinal,
           NULL::int AS conflicting_item_ordinal,
           active.item_id AS conflicting_item_id,
           proposed.drug_id AS item_drug_id,
           active.drug_id AS conflicting_drug_id,
           interaction.severity,
           interaction.mechanism,
           interaction.clinical_effect
    FROM proposed
    JOIN active_medications AS active ON TRUE
    JOIN drug_interaction AS interaction
      ON interaction.drug_a_id = LEAST(proposed.drug_id, active.drug_id)
     AND interaction.drug_b_id = GREATEST(proposed.drug_id, active.drug_id)

    UNION ALL

    SELECT later.item_ordinal,
           earlier.item_ordinal AS conflicting_item_ordinal,
           NULL::int AS conflicting_item_id,
           later.drug_id AS item_drug_id,
           earlier.drug_id AS conflicting_drug_id,
           interaction.severity,
           interaction.mechanism,
           interaction.clinical_effect
    FROM proposed AS later
    JOIN proposed AS earlier ON earlier.item_ordinal < later.item_ordinal
    JOIN drug_interaction AS interaction
      ON interaction.drug_a_id = LEAST(later.drug_id, earlier.drug_id)
     AND interaction.drug_b_id = GREATEST(later.drug_id, earlier.drug_id)
  )
  SELECT matches.item_ordinal,
         matches.conflicting_item_ordinal,
         matches.conflicting_item_id,
         matches.item_drug_id,
         matches.conflicting_drug_id,
         item_drug.drug_name AS item_drug_name,
         conflicting_drug.drug_name AS conflicting_drug_name,
         matches.severity,
         format(
           'Interaction detected: %s. Clinical effect: %s',
           matches.mechanism,
           matches.clinical_effect
         ) AS message
  FROM matches
  JOIN drug AS item_drug ON item_drug.drug_id = matches.item_drug_id
  JOIN drug AS conflicting_drug
    ON conflicting_drug.drug_id = matches.conflicting_drug_id
  ORDER BY matches.item_ordinal,
           matches.conflicting_item_id NULLS FIRST,
           matches.conflicting_item_ordinal NULLS FIRST,
           matches.item_drug_id,
           matches.conflicting_drug_id`;

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

function reviewSecret(): string | null {
  return process.env.SESSION_SECRET || null;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function createReviewToken(payload: ReviewTokenPayload): string | null {
  const secret = reviewSecret();
  if (!secret) return null;

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function readReviewToken(value: unknown): ReviewTokenPayload | null {
  const secret = reviewSecret();
  if (!secret || typeof value !== "string" || value.length > 4096) return null;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const encoded = value.slice(0, separator);
  const provided = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(
    createHmac("sha256", secret).update(encoded).digest("base64url"),
  );
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (
      !isRecord(payload) ||
      !isPositiveInteger(payload.userId) ||
      !isPositiveInteger(payload.consultationId) ||
      typeof payload.requestHash !== "string" ||
      typeof payload.alertsHash !== "string" ||
      typeof payload.expiresAt !== "number" ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }
    return payload as ReviewTokenPayload;
  } catch {
    return null;
  }
}

function makeReviewToken(
  userId: number,
  consultationId: number,
  requestHash: string,
  alerts: InteractionPreview[],
): string | null {
  return createReviewToken({
    userId,
    consultationId,
    requestHash,
    alertsHash: hash(alerts),
    expiresAt: Date.now() + REVIEW_TOKEN_TTL_MS,
  });
}

export async function GET() {
  try {
    const authorization = await requireRole(["prescriber"]);
    if (authorization instanceof NextResponse) return authorization;
    return NextResponse.json({ resource: "prescriptions" });
  } catch {
    return NextResponse.json(
      { error: "Unable to verify authorization" },
      { status: 500 },
    );
  }
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

  const action = body.action;
  const consultationId = body.consultation_id;
  if (action !== "review" && action !== "save") {
    return NextResponse.json(
      { error: "action must be either review or save" },
      { status: 400 },
    );
  }
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
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) {
    return NextResponse.json(
      { error: "items must be an array containing 1 to 100 items" },
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

  const notes = typeof body.notes === "string" ? body.notes : null;
  const requestHash = hash({ consultation_id: consultationId, notes, items });
  let suppliedReview: ReviewTokenPayload | null = null;
  if (action === "save") {
    suppliedReview = readReviewToken(body.interaction_review_token);
    if (
      !suppliedReview ||
      suppliedReview.userId !== userId ||
      suppliedReview.consultationId !== consultationId ||
      suppliedReview.requestHash !== requestHash
    ) {
      return NextResponse.json(
        { error: "Review the current interaction check before saving" },
        { status: 409 },
      );
    }
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
      appointment_id: number;
      doctor_id: number;
      patient_id: number;
    }>(
      `SELECT c.consultation_id, a.appointment_id, a.doctor_id, a.patient_id
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

    const interactionResult = await client.query<InteractionPreview>(
      INTERACTION_QUERY,
      [consultation.patient_id, items.map((item) => item.drug_id)],
    );
    const interactionAlerts = interactionResult.rows;
    const currentReviewToken = makeReviewToken(
      userId,
      consultationId,
      requestHash,
      interactionAlerts,
    );
    if (!currentReviewToken) {
      throw new Error("Session signing secret is unavailable");
    }

    if (action === "review") {
      await client.query("COMMIT");
      transactionStarted = false;
      return NextResponse.json({
        interaction_alerts: interactionAlerts,
        interaction_review_token: currentReviewToken,
        warning:
          "Interaction checks are not a guarantee that a prescription is safe.",
      });
    }

    if (suppliedReview?.alertsHash !== hash(interactionAlerts)) {
      await client.query("COMMIT");
      transactionStarted = false;
      return NextResponse.json(
        {
          error: "Interaction results changed. Review the updated results before saving.",
          interaction_alerts: interactionAlerts,
          interaction_review_token: currentReviewToken,
        },
        { status: 409 },
      );
    }

    const prescriptionResult = await client.query<PrescriptionRecord>(
      `INSERT INTO prescription (consultation_id, notes)
       VALUES ($1, $2)
       RETURNING prescription_id, consultation_id, issued_at, notes`,
      [consultationId, notes],
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
      `SELECT alert.alert_id, alert.item_id, alert.conflicting_item_id,
              alert.severity, alert.message, alert.raised_at
       FROM interaction_alert AS alert
       WHERE alert.item_id IN (
           SELECT item.item_id
           FROM prescription_item AS item
           WHERE item.prescription_id = $1
       )
          OR alert.conflicting_item_id IN (
           SELECT item.item_id
           FROM prescription_item AS item
           WHERE item.prescription_id = $1
       )
       ORDER BY alert.raised_at, alert.alert_id`,
      [prescription.prescription_id],
    );

    await client.query("COMMIT");
    transactionStarted = false;
    return NextResponse.json(
      {
        prescription,
        items: insertedItems,
        interaction_alerts: alertResult.rows,
        warning:
          "Interaction checks are not a guarantee that a prescription is safe.",
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
      { error: "Unable to process this prescription" },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
