import { Pool, type PoolClient } from "pg";
// Node executes this script with --experimental-strip-types.
// @ts-expect-error Node's native TypeScript runner requires the extension.
import { embed } from "../lib/embeddings.ts";

interface ReportRow {
  report_id: number;
  narrative: string;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function embedSeedReports(): Promise<void> {
  let client: PoolClient | undefined;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const reports = await client.query<ReportRow>(
      `SELECT report_id, narrative
       FROM ade_report
       WHERE narrative_vec IS NULL
       ORDER BY report_id`,
    );

    for (const report of reports.rows) {
      const vector = await embed(report.narrative);

      await client.query(
        `UPDATE ade_report
         SET narrative_vec = $1::vector
         WHERE report_id = $2
           AND narrative_vec IS NULL`,
        [`[${vector.join(",")}]`, report.report_id],
      );
    }

    await client.query("COMMIT");
    console.log(`Embedded ${reports.rowCount ?? 0} ADE report(s).`);
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

embedSeedReports().catch((error: unknown) => {
  console.error("Seed embedding failed:", error);
  process.exitCode = 1;
});
