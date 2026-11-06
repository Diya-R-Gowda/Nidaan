import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";

async function migrateSignalRates(): Promise<void> {
  const connectionString = process.env.NIDAAN_MIGRATION_DATABASE_URL;
  const expectedDatabase = process.env.NIDAAN_EXPECTED_DATABASE;
  if (!connectionString || !expectedDatabase?.trim()) {
    throw new Error("NIDAAN_MIGRATION_DATABASE_URL and NIDAAN_EXPECTED_DATABASE are required");
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

    const migration = await readFile(
      resolve("db/migrations/20261102_signal_rate_minimum_exposure.sql"),
      "utf8",
    );
    await client.query(migration);

    const verification = await client.query<{ rows: number }>(
      "SELECT count(*)::int AS rows FROM public.vw_drug_signal_rates",
    );
    console.log(
      `Signal-rate materialized view migration applied to ${databaseName}; ${verification.rows[0]?.rows ?? 0} qualifying drug row(s).`,
    );
  } finally {
    await client.end();
  }
}

migrateSignalRates().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Signal-rate migration failed",
  );
  process.exitCode = 1;
});
