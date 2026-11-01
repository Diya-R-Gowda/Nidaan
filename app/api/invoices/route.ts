import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { requireRole } from "@/lib/auth";
import { pool } from "@/lib/db";

type InvoiceRow = {
  invoice_id: number;
  consultation_id: number;
  issued_by: number;
  subtotal: string | number | null;
  tax_amount: string | number | null;
  total: string | number | null;
  status: string | null;
  issued_at: Date | string | null;
};

type InvoiceLineRow = {
  line_id: number;
  invoice_id: number;
  line_type: string | null;
  description: string | null;
  quantity: number | null;
  unit_price: string | number | null;
  line_total: string | number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET() {
  try {
    const authorization = await requireRole(["receptionist"]);
    if (authorization instanceof NextResponse) return authorization;
    return NextResponse.json({ resource: "invoices" });
  } catch {
    return NextResponse.json(
      { error: "Unable to verify authorization" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let receptionistId: number;
  try {
    const authorization = await requireRole(["receptionist"]);
    if (authorization instanceof NextResponse) return authorization;
    receptionistId = authorization.userId;
  } catch {
    return NextResponse.json(
      { error: "Unable to verify authorization" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const consultationId = body.consultation_id;
  if (
    typeof consultationId !== "number" ||
    !Number.isSafeInteger(consultationId) ||
    consultationId < 1 ||
    consultationId > 2_147_483_647
  ) {
    return NextResponse.json(
      { error: "consultation_id must be a positive integer" },
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

    // Lock the consultation and its appointment so concurrent API requests for
    // this consultation serialize before checking completion or duplicates.
    const consultationResult = await client.query<{
      consultation_id: number;
      appointment_status: string;
    }>(
      `SELECT consultation.consultation_id,
              appointment.status AS appointment_status
       FROM consultation
       JOIN appointment ON appointment.appointment_id = consultation.appointment_id
       WHERE consultation.consultation_id = $1
       FOR UPDATE OF consultation, appointment`,
      [consultationId],
    );
    const consultation = consultationResult.rows[0];
    if (!consultation) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json({ error: "Consultation not found" }, { status: 404 });
    }
    if (consultation.appointment_status !== "completed") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json(
        { error: "Invoices can only be generated for completed consultations" },
        { status: 409 },
      );
    }

    const existingResult = await client.query<{ invoice_id: number }>(
      `SELECT invoice_id
       FROM invoice
       WHERE consultation_id = $1`,
      [consultationId],
    );
    if (existingResult.rows[0]) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json(
        {
          error: "An invoice already exists for this consultation",
          invoice_id: existingResult.rows[0].invoice_id,
        },
        { status: 409 },
      );
    }

    // The database function computes totals and inserts the invoice header
    // plus all itemized lines within this transaction.
    const generated = await client.query<{ invoice_id: number }>(
      "SELECT fn_compute_invoice($1)::int AS invoice_id",
      [consultationId],
    );
    const invoiceId = generated.rows[0]?.invoice_id;
    if (!invoiceId) throw new Error("Invoice function returned no identifier");

    // The function defaults issued_by to the doctor. Attribute this API-created
    // invoice to the authenticated receptionist instead.
    await client.query(
      "UPDATE invoice SET issued_by = $2 WHERE invoice_id = $1",
      [invoiceId, receptionistId],
    );

    const invoiceResult = await client.query<InvoiceRow>(
      `SELECT invoice_id, consultation_id, issued_by, subtotal, tax_amount,
              total, status, issued_at
       FROM invoice
       WHERE invoice_id = $1`,
      [invoiceId],
    );
    const linesResult = await client.query<InvoiceLineRow>(
      `SELECT line_id, invoice_id, line_type, description, quantity,
              unit_price, line_total
       FROM invoice_line
       WHERE invoice_id = $1
       ORDER BY line_id`,
      [invoiceId],
    );
    if (!invoiceResult.rows[0]) throw new Error("Generated invoice was not found");

    await client.query("COMMIT");
    transactionStarted = false;
    return NextResponse.json(
      { invoice: invoiceResult.rows[0], lines: linesResult.rows },
      { status: 201 },
    );
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Keep database details out of the API response.
      }
    }

    if (isRecord(error) && error.code === "23505") {
      const existing = await pool.query<{ invoice_id: number }>(
        "SELECT invoice_id FROM invoice WHERE consultation_id = $1",
        [consultationId],
      ).catch(() => null);
      if (existing?.rows[0]) {
        return NextResponse.json(
          {
            error: "An invoice already exists for this consultation",
            invoice_id: existing.rows[0].invoice_id,
          },
          { status: 409 },
        );
      }
    }

    return NextResponse.json({ error: "Unable to generate invoice" }, { status: 500 });
  } finally {
    client?.release();
  }
}
