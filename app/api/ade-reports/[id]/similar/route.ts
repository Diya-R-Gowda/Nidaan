import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { pool } from "@/lib/db";
import { embed } from "@/lib/embeddings";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type SourceReport = {
  narrative: string;
};

type SimilarReport = {
  report_id: number;
  narrative: string;
  onset_date: string;
  cosine_similarity?: number;
  fulltext_relevance?: number;
};

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const authorization = await requireRole(["pharmacovigilance"]);
    if (authorization instanceof NextResponse) return authorization;
  } catch {
    return NextResponse.json(
      { error: "Unable to verify authorization" },
      { status: 500 },
    );
  }

  let reportId: number;
  try {
    const { id } = await params;
    if (!/^[1-9]\d*$/.test(id)) {
      return NextResponse.json({ error: "Invalid report ID" }, { status: 400 });
    }

    reportId = Number(id);
    if (!Number.isSafeInteger(reportId) || reportId > 2_147_483_647) {
      return NextResponse.json({ error: "Invalid report ID" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid report ID" }, { status: 400 });
  }

  const mode = new URL(request.url).searchParams.get("mode") ?? "vector";
  if (mode !== "vector" && mode !== "fulltext") {
    return NextResponse.json(
      { error: "Mode must be either 'vector' or 'fulltext'" },
      { status: 400 },
    );
  }

  try {
    const sourceResult = await pool.query<SourceReport>(
      "SELECT narrative FROM ade_report WHERE report_id = $1",
      [reportId],
    );
    const source = sourceResult.rows[0];

    if (!source) {
      return NextResponse.json({ error: "ADE report not found" }, { status: 404 });
    }

    let neighbours: SimilarReport[];
    let scoreDescription: string;

    if (mode === "fulltext") {
      const result = await pool.query<SimilarReport>(
        `WITH search_query AS (
           SELECT plainto_tsquery('english', $1) AS terms
         )
         SELECT r.report_id,
                r.narrative,
                r.onset_date,
                ts_rank_cd(r.narrative_tsv, q.terms)::real AS fulltext_relevance
         FROM ade_report r
         CROSS JOIN search_query q
         WHERE r.report_id <> $2
           AND r.narrative_tsv @@ q.terms
         ORDER BY ts_rank_cd(r.narrative_tsv, q.terms) DESC, r.report_id
         LIMIT 10`,
        [source.narrative, reportId],
      );
      neighbours = result.rows;
      scoreDescription =
        "fulltext_relevance is PostgreSQL ts_rank_cd for the English plainto_tsquery built from the source narrative; higher values rank better.";
    } else {
      const sourceVector = await embed(source.narrative);
      const vectorParameter = `[${sourceVector.join(",")}]`;
      const result = await pool.query<SimilarReport>(
        `SELECT r.report_id,
                r.narrative,
                r.onset_date,
                1 - (r.narrative_vec <=> $1::vector) AS cosine_similarity
         FROM ade_report r
         WHERE r.report_id <> $2
           AND r.narrative_vec IS NOT NULL
         ORDER BY r.narrative_vec <=> $1::vector
         LIMIT 10`,
        [vectorParameter, reportId],
      );
      neighbours = result.rows;
      scoreDescription =
        "cosine_similarity is calculated as 1 minus pgvector cosine distance (narrative_vec <=> source vector); higher values indicate closer vector matches.";
    }

    return NextResponse.json({ reportId, mode, scoreDescription, neighbours });
  } catch (error) {
    console.error("ADE report similarity search failed:", error);
    return NextResponse.json(
      { error: "Unable to find similar ADE reports" },
      { status: 500 },
    );
  }
}
