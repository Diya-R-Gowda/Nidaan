import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { pool } from "@/lib/db";

type Drug = {
  drug_id: number;
  drug_name: string;
  generic_name: string;
  drug_class: string;
  form: string;
  strength: string;
  unit_price: string | number;
  is_active: boolean;
};

type DrugInput = Omit<Drug, "drug_id" | "is_active">;

const stringLimits = {
  drug_name: 160,
  generic_name: 160,
  drug_class: 120,
  form: 60,
  strength: 60,
} as const;

function validateDrugInput(value: unknown): DrugInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const body = value as Record<string, unknown>;
  const fields = {} as Pick<DrugInput, keyof typeof stringLimits>;

  for (const [field, maxLength] of Object.entries(stringLimits) as [keyof typeof stringLimits, number][]) {
    const candidate = body[field];
    if (
      typeof candidate !== "string" ||
      candidate.trim() === "" ||
      candidate.trim().length > maxLength
    ) {
      return null;
    }
    fields[field] = candidate.trim();
  }

  const unitPrice = body.unit_price;
  if (
    typeof unitPrice !== "number" ||
    !Number.isFinite(unitPrice) ||
    unitPrice < 0 ||
    unitPrice > 99_999_999.99 ||
    Math.abs(Math.round(unitPrice * 100) - unitPrice * 100) > 1e-8
  ) {
    return null;
  }

  return { ...fields, unit_price: unitPrice };
}

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

export async function GET() {
  const authorizationError = await authorizeAdmin();
  if (authorizationError) return authorizationError;

  try {
    const result = await pool.query<Drug>(
      `SELECT drug_id, drug_name, generic_name, drug_class, form, strength,
              unit_price, is_active
       FROM drug
       ORDER BY is_active DESC, drug_name, generic_name, strength, drug_id`,
    );
    return NextResponse.json({ drugs: result.rows });
  } catch (error) {
    console.error("Admin drug catalogue load failed:", error);
    return NextResponse.json(
      { error: "Unable to load the drug catalogue" },
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

  const drug = validateDrugInput(body);
  if (!drug) {
    return NextResponse.json(
      {
        error:
          "Provide all drug fields within their allowed lengths and a non-negative unit_price with at most two decimal places.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await pool.query<Drug>(
      `INSERT INTO drug (
         drug_name, generic_name, drug_class, form, strength, unit_price
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING drug_id, drug_name, generic_name, drug_class, form, strength,
                 unit_price, is_active`,
      [
        drug.drug_name,
        drug.generic_name,
        drug.drug_class,
        drug.form,
        drug.strength,
        drug.unit_price,
      ],
    );
    return NextResponse.json({ drug: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error("Admin drug creation failed:", error);
    return NextResponse.json(
      { error: "Unable to add the drug" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const authorizationError = await authorizeAdmin();
  if (authorizationError) return authorizationError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const drugId =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>).drug_id
      : null;
  if (
    typeof drugId !== "number" ||
    !Number.isSafeInteger(drugId) ||
    drugId < 1 ||
    drugId > 2_147_483_647
  ) {
    return NextResponse.json({ error: "A valid drug_id is required" }, { status: 400 });
  }

  try {
    const result = await pool.query<Drug>(
      `UPDATE drug
       SET is_active = FALSE
       WHERE drug_id = $1
         AND is_active = TRUE
       RETURNING drug_id, drug_name, generic_name, drug_class, form, strength,
                 unit_price, is_active`,
      [drugId],
    );

    if (result.rows[0]) {
      return NextResponse.json({ drug: result.rows[0] });
    }

    const existing = await pool.query<{ is_active: boolean }>(
      "SELECT is_active FROM drug WHERE drug_id = $1",
      [drugId],
    );
    if (!existing.rows[0]) {
      return NextResponse.json({ error: "Drug not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Drug is already inactive" }, { status: 409 });
  } catch (error) {
    console.error("Admin drug deactivation failed:", error);
    return NextResponse.json(
      { error: "Unable to deactivate the drug" },
      { status: 500 },
    );
  }
}
