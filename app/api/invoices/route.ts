import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { requireRole } from "@/lib/auth";
import { pool } from "@/lib/db";

type InvoiceRequest = {
  consultation_id: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  let body: InvoiceRequest;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    body = parsed as InvoiceRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !Number.isSafeInteger(body.consultation_id) ||
    (body.consultation_id as number) < 1
  ) {
    return NextResponse.json(
      { error: "consultation_id must be a positive integer" },
      { status: 400 },
    );
  }

  const consultationId = body.consultation_id as number;
  let client: PoolClient | undefined;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const consultationResult = await client.query(
      "SELECT consultation_id FROM consultation WHERE consultation_id = $1",
      [consultationId],
    );
    if (consultationResult.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json(
        { error: "Consultation not found" },
        { status: 404 },
      );
    }

    const invoiceResult = await client.query<{ invoice_id: number }>(
      "SELECT fn_compute_invoice($1)::int AS invoice_id",
      [consultationId],
    );
    const invoiceId = invoiceResult.rows[0]?.invoice_id;
    if (!invoiceId) {
      throw new Error("Invoice function did not return an invoice ID");
    }

    const invoice = await client.query(
      `SELECT invoice_id, consultation_id, issued_by, subtotal,
              tax_amount, total, status, issued_at
       FROM invoice
       WHERE invoice_id = $1`,
      [invoiceId],
    );
    const lines = await client.query(
      `SELECT line_id, invoice_id, line_type, description, quantity,
              unit_price, line_total
       FROM invoice_line
       WHERE invoice_id = $1
       ORDER BY line_id`,
      [invoiceId],
    );

    await client.query("COMMIT");
    transactionStarted = false;
    return NextResponse.json(
      { invoice: invoice.rows[0], invoice_lines: lines.rows },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (transactionStarted && client) {
      await client.query("ROLLBACK").catch((rollbackError) => {
        console.error("Invoice transaction rollback failed:", rollbackError);
      });
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { error: "An invoice already exists for this consultation" },
        { status: 409 },
      );
    }

    console.error("Invoice creation failed:", error);
    return NextResponse.json(
      { error: "Unable to create the invoice" },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
