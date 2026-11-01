import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { pool } from "@/lib/db";

const PAGE_SIZE = 50;
const MAX_PAGE = 1_000_000;

type AuditLogRow = {
  log_id: number;
  actor_user_id: number | null;
  action: string | null;
  entity_type: string | null;
  entity_id: number | null;
  occurred_at: Date | string | null;
};

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
  try {
    const authorization = await requireRole(["admin"]);
    if (authorization instanceof NextResponse) return authorization;
  } catch {
    return NextResponse.json(
      { error: "Unable to verify authorization" },
      { status: 500 },
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const actionValue = searchParams.get("action")?.trim() ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const pageValue = searchParams.get("page") ?? "1";

  if (actionValue.length > 100) {
    return NextResponse.json(
      { error: "Action filter must be 100 characters or fewer" },
      { status: 400 },
    );
  }
  if ((from && !validDate(from)) || (to && !validDate(to))) {
    return NextResponse.json(
      { error: "Dates must be valid calendar dates in YYYY-MM-DD format" },
      { status: 400 },
    );
  }
  if (from && to && from > to) {
    return NextResponse.json(
      { error: "The start date must be on or before the end date" },
      { status: 400 },
    );
  }

  const page = Number(pageValue);
  if (!/^[1-9]\d*$/.test(pageValue) || !Number.isSafeInteger(page) || page > MAX_PAGE) {
    return NextResponse.json({ error: "Invalid page number" }, { status: 400 });
  }

  const offset = (page - 1) * PAGE_SIZE;
  const filters = [actionValue || null, from || null, to || null];

  try {
    const [countResult, logResult] = await Promise.all([
      pool.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total
         FROM audit_log AS log
         WHERE ($1::text IS NULL OR log.action ILIKE '%' || $1 || '%')
           AND ($2::date IS NULL OR log.occurred_at >= ($2::date AT TIME ZONE 'Asia/Kolkata'))
           AND ($3::date IS NULL OR log.occurred_at < (($3::date + 1) AT TIME ZONE 'Asia/Kolkata'))`,
        filters,
      ),
      pool.query<AuditLogRow>(
        `SELECT log.log_id,
                log.actor_user_id,
                log.action,
                log.entity_type,
                log.entity_id,
                log.occurred_at
         FROM audit_log AS log
         WHERE ($1::text IS NULL OR log.action ILIKE '%' || $1 || '%')
           AND ($2::date IS NULL OR log.occurred_at >= ($2::date AT TIME ZONE 'Asia/Kolkata'))
           AND ($3::date IS NULL OR log.occurred_at < (($3::date + 1) AT TIME ZONE 'Asia/Kolkata'))
         ORDER BY log.occurred_at DESC NULLS LAST, log.log_id DESC
         LIMIT $4 OFFSET $5`,
        [...filters, PAGE_SIZE, offset],
      ),
    ]);

    return NextResponse.json({
      logs: logResult.rows,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total: Number(countResult.rows[0]?.total ?? 0),
      },
    });
  } catch (error) {
    console.error("Admin audit log query failed:", error);
    return NextResponse.json(
      { error: "Unable to load audit logs" },
      { status: 500 },
    );
  }
}
