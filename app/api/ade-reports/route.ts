import { NextResponse } from "next/server";
import { embed } from "@/lib/embeddings";
import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";

interface AdeReportBody {
  patientId?: unknown;
  itemId?: unknown;
  narrative?: unknown;
  onsetDate?: unknown;
}

interface ReportRow {
  report_id: number;
}

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

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export async function POST(request: Request) {
  let access: Awaited<ReturnType<typeof requireRole>>;
  try {
    access = await requireRole(["prescriber"]);
  } catch {
    return NextResponse.json(
      { error: "Unable to verify authorization" },
      { status: 500 },
    );
  }

  if (access instanceof NextResponse) {
    return access;
  }

  let body: AdeReportBody;

  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    body = parsed as AdeReportBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !isPositiveInteger(body.patientId) ||
    (body.itemId !== undefined && body.itemId !== null && !isPositiveInteger(body.itemId)) ||
    typeof body.narrative !== "string" ||
    Array.from(body.narrative.trim()).length < 20 ||
    !isValidDate(body.onsetDate)
  ) {
    return NextResponse.json(
      {
        error:
          "patientId must be a positive integer, itemId must be null or a positive integer, narrative must contain at least 20 characters, and onsetDate must be a valid YYYY-MM-DD date",
      },
      { status: 400 },
    );
  }

  const patientId = body.patientId;
  const itemId = body.itemId ?? null;
  const narrative = body.narrative.trim();

  try {
    const narrativeVector = await embed(narrative);
    const client = await pool.connect();
    let transactionStarted = false;

    try {
      await client.query("BEGIN");
      transactionStarted = true;
      await client.query(
        "SELECT set_config('nidaan.actor_user_id', $1, TRUE)",
        [String(access.userId)],
      );

      const doctorResult = await client.query<{ doctor_id: number }>(
        `SELECT d.doctor_id
         FROM doctor AS d
         JOIN user_account AS account ON account.user_id = d.user_id
         WHERE d.user_id = $1
           AND account.role = 'prescriber'
           AND account.is_active = TRUE
         FOR SHARE OF d, account`,
        [access.userId],
      );

      if (!doctorResult.rows[0]) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return NextResponse.json(
          { error: "Prescriber profile not found" },
          { status: 403 },
        );
      }

      const ownershipResult = await client.query(
        `SELECT a.appointment_id
         FROM appointment AS a
         WHERE a.patient_id = $1
           AND a.doctor_id = $2
           AND (
             $3::int IS NULL
             OR EXISTS (
               SELECT 1
               FROM prescription_item AS pi
               JOIN prescription AS p
                 ON p.prescription_id = pi.prescription_id
               JOIN consultation AS c
                 ON c.consultation_id = p.consultation_id
               WHERE pi.item_id = $3
                 AND c.appointment_id = a.appointment_id
             )
           )
         LIMIT 1
         FOR SHARE OF a`,
        [patientId, doctorResult.rows[0].doctor_id, itemId],
      );

      if (!ownershipResult.rows[0]) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return NextResponse.json(
          { error: "Patient or prescription item was not found for this prescriber" },
          { status: 404 },
        );
      }

      const result = await client.query<ReportRow>(
        `INSERT INTO ade_report (
           patient_id, item_id, narrative, narrative_vec, onset_date, reported_by, status
         )
         VALUES ($1, $2, $3, $4::vector, $5, $6, 'new')
         RETURNING report_id`,
        [
          patientId,
          itemId,
          narrative,
          `[${narrativeVector.join(",")}]`,
          body.onsetDate,
          access.userId,
        ],
      );

      await client.query("COMMIT");
      transactionStarted = false;

      return NextResponse.json(
        { reportId: result.rows[0].report_id },
        { status: 201 },
      );
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Keep database details out of the API response.
        }
      }
      throw error;
    } finally {
      client.release();
    }
  } catch {
    return NextResponse.json(
      { error: "Unable to create ADE report" },
      { status: 500 },
    );
  }
}
