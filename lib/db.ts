import { Pool } from "pg";

declare global {
  var nidaanPool: Pool | undefined;
}

export const pool =
  globalThis.nidaanPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.nidaanPool = pool;
}
