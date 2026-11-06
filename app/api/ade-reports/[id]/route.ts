import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function PATCH(request: Request, { params }: RouteContext) {
  let access: Awaited<ReturnType<typeof requireRole>>;
  try {
    access = await requireRole(["pharmacovigilance"]);
  } catch {
    return NextResponse.json({ error: "Unable to verify authorization" }, { status: 500 });
  }
  if (access instanceof NextResponse) return access;

  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) {
    return NextResponse.json({ error: "Invalid report ID" }, { status: 400 });
  }
  const reportId = Number(id);
  if (!Number.isSafeInteger(reportId) || reportId > 2_147_483_647) {
    return NextResponse.json({ error: "Invalid report ID" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isRecord(body) || (body.status !== "confirmed" && body.status !== "dismissed")) {
    return NextResponse.json({ error: "status must be confirmed or dismissed" }, { status: 400 });
  }

  let client: PoolClient | undefined;
  let inTransaction = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    inTransaction = true;
    await client.query(
      "SELECT set_config('nidaan.actor_user_id', $1, TRUE)",
      [String(access.userId)],
    );
    const current = await client.query<{ status: string | null }>(
      "SELECT status FROM ade_report WHERE report_id = $1 FOR UPDATE",
      [reportId],
    );
    if (!current.rows[0]) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return NextResponse.json({ error: "ADE report not found" }, { status: 404 });
    }
    if (current.rows[0].status === body.status) {
      await client.query("COMMIT");
      inTransaction = false;
      return NextResponse.json({ reportId, status: body.status });
    }
    if (current.rows[0].status !== "new" && current.rows[0].status !== "under_review") {
      await client.query("ROLLBACK");
      inTransaction = false;
      return NextResponse.json(
        { error: "This report has already been finalized" },
        { status: 409 },
      );
    }

    const updated = await client.query<{ report_id: number; status: string }>(
      `UPDATE ade_report
       SET status = $1
       WHERE report_id = $2
       RETURNING report_id, status`,
      [body.status, reportId],
    );
    await client.query("COMMIT");
    inTransaction = false;
    return NextResponse.json(updated.rows[0]);
  } catch {
    if (inTransaction && client) {
      try { await client.query("ROLLBACK"); } catch { /* keep DB details private */ }
    }
    return NextResponse.json({ error: "Unable to update ADE report status" }, { status: 500 });
  } finally {
    client?.release();
  }
}
