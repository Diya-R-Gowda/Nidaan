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

export async function POST(request: Request) {
  const access = await requireRole(["prescriber", "pharmacovigilance"]);

  if (access instanceof NextResponse) {
    return access;
  }

  let body: AdeReportBody;

  try {
    body = (await request.json()) as AdeReportBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !Number.isInteger(body.patientId) ||
    (body.itemId !== undefined && !Number.isInteger(body.itemId)) ||
    typeof body.narrative !== "string" ||
    body.narrative.trim().length < 20 ||
    typeof body.onsetDate !== "string" ||
    body.onsetDate.trim() === ""
  ) {
    return NextResponse.json(
      {
        error:
          "patientId, narrative of at least 20 characters, and onsetDate are required",
      },
      { status: 400 },
    );
  }

  try {
    const narrative = body.narrative.trim();
    const narrativeVector = await embed(narrative);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const result = await client.query<ReportRow>(
        `INSERT INTO ade_report (
           patient_id, item_id, narrative, narrative_vec, onset_date, reported_by, status
         )
         VALUES ($1, $2, $3, $4::vector, $5, $6, 'new')
         RETURNING report_id`,
        [
          body.patientId,
          body.itemId ?? null,
          narrative,
          `[${narrativeVector.join(",")}]`,
          body.onsetDate,
          access.userId,
        ],
      );

      await client.query("COMMIT");

      return NextResponse.json(
        { reportId: result.rows[0].report_id },
        { status: 201 },
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("ADE report creation failed:", error);
    return NextResponse.json(
      { error: "Unable to create ADE report" },
      { status: 500 },
    );
  }
}
