import { Client } from "pg";

async function refreshSignalRates(): Promise<void> {
  const connectionString = process.env.NIDAAN_MAINTENANCE_DATABASE_URL;
  const expectedDatabase = process.env.NIDAAN_EXPECTED_DATABASE;
  if (!connectionString || !expectedDatabase?.trim()) {
    throw new Error("NIDAAN_MAINTENANCE_DATABASE_URL and NIDAAN_EXPECTED_DATABASE are required");
  }

  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );
    const databaseName = result.rows[0]?.database_name;
    if (!databaseName || databaseName !== expectedDatabase) {
      throw new Error("Connected database does not match NIDAAN_EXPECTED_DATABASE");
    }

    // PostgreSQL disallows REFRESH MATERIALIZED VIEW inside a transaction block.
    await client.query("REFRESH MATERIALIZED VIEW public.vw_drug_signal_rates");
    const counts = await client.query<{ rows: number }>(
      "SELECT count(*)::int AS rows FROM public.vw_drug_signal_rates",
    );
    console.log(
      `Signal rates refreshed in ${databaseName}; ${counts.rows[0]?.rows ?? 0} qualifying drug row(s).`,
    );
  } finally {
    await client.end();
  }
}

refreshSignalRates().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Signal-rate refresh failed",
  );
  process.exitCode = 1;
});
