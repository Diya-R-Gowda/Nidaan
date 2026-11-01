import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { pool } from "@/lib/db";

type Interaction = {
  drug_a_id: number;
  drug_b_id: number;
  drug_a_name: string;
  drug_b_name: string;
  severity: string;
  mechanism: string;
  clinical_effect: string;
  reference_source: string | null;
};

const severities = new Set(["minor", "moderate", "major"]);

async function authorizeAdmin() {
  try {
    const authorization = await requireRole(["admin"]);
    if (authorization instanceof NextResponse) return authorization;
    return null;
  } catch {
    return NextResponse.json(
      { error: "Unable to verify authorization" },
      { status: 500 },
    );
  }
}

function isValidDrugId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 2_147_483_647
  );
}

function textField(
  body: Record<string, unknown>,
  field: string,
  required: boolean,
  maxLength: number,
): string | null {
  const value = body[field];
  if (value === undefined && !required) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if ((required && !trimmed) || trimmed.length > maxLength) return null;
  return trimmed;
}

export async function GET() {
  const authorizationError = await authorizeAdmin();
  if (authorizationError) return authorizationError;

  try {
    const result = await pool.query<Interaction>(
      `SELECT interaction.drug_a_id, interaction.drug_b_id,
              drug_a.drug_name AS drug_a_name,
              drug_b.drug_name AS drug_b_name,
              interaction.severity, interaction.mechanism,
              interaction.clinical_effect, interaction.reference_source
       FROM drug_interaction AS interaction
       JOIN drug AS drug_a ON drug_a.drug_id = interaction.drug_a_id
       JOIN drug AS drug_b ON drug_b.drug_id = interaction.drug_b_id
       ORDER BY drug_a.drug_name, drug_b.drug_name, interaction.drug_a_id,
                interaction.drug_b_id`,
    );
    return NextResponse.json({ interactions: result.rows });
  } catch (error) {
    console.error("Admin interaction load failed:", error);
    return NextResponse.json(
      { error: "Unable to load drug interactions" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authorizationError = await authorizeAdmin();
  if (authorizationError) return authorizationError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "A JSON object is required" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const firstDrugId = input.drug_a_id;
  const secondDrugId = input.drug_b_id;
  const severity = textField(input, "severity", true, 20);
  const mechanism = textField(input, "mechanism", true, 10_000);
  const clinicalEffect = textField(input, "clinical_effect", true, 10_000);
  const referenceSource = textField(input, "reference_source", false, 10_000);

  if (
    !isValidDrugId(firstDrugId) ||
    !isValidDrugId(secondDrugId) ||
    firstDrugId === secondDrugId ||
    severity === null ||
    !severities.has(severity) ||
    mechanism === null ||
    clinicalEffect === null ||
    (input.reference_source !== undefined && referenceSource === null)
  ) {
    return NextResponse.json(
      {
        error:
          "Provide two different valid drug IDs, a severity of minor, moderate, or major, and non-empty mechanism and clinical effect fields.",
      },
      { status: 400 },
    );
  }

  const drugAId = Math.min(firstDrugId, secondDrugId);
  const drugBId = Math.max(firstDrugId, secondDrugId);

  try {
    const result = await pool.query<Interaction>(
      `INSERT INTO drug_interaction (
         drug_a_id, drug_b_id, severity, mechanism, clinical_effect,
         reference_source
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING drug_a_id, drug_b_id, severity, mechanism, clinical_effect,
                 reference_source`,
      [drugAId, drugBId, severity, mechanism, clinicalEffect, referenceSource],
    );
    return NextResponse.json({ interaction: result.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { error: "An interaction between these two drugs already exists." },
        { status: 409 },
      );
    }

    console.error("Admin interaction creation failed:", error);
    return NextResponse.json(
      { error: "Unable to add the drug interaction" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const authorizationError = await authorizeAdmin();
  if (authorizationError) return authorizationError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "A JSON object is required" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  if (!isValidDrugId(input.drug_a_id) || !isValidDrugId(input.drug_b_id)) {
    return NextResponse.json(
      { error: "Valid drug_a_id and drug_b_id values are required" },
      { status: 400 },
    );
  }

  const drugAId = Math.min(input.drug_a_id, input.drug_b_id);
  const drugBId = Math.max(input.drug_a_id, input.drug_b_id);

  try {
    const result = await pool.query(
      `DELETE FROM drug_interaction
       WHERE drug_a_id = $1 AND drug_b_id = $2`,
      [drugAId, drugBId],
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Interaction not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Admin interaction deletion failed:", error);
    return NextResponse.json(
      { error: "Unable to delete the drug interaction" },
      { status: 500 },
    );
  }
}
