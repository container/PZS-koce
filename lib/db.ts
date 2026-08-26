import { Pool } from "pg";

export const pool = new Pool({
  // Do not throw at module load: Next evaluates route modules during `next build`.
  // PostgreSQL will fail loudly on the first request if Railway has not provided it.
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DATABASE_POOL_MAX ?? 5),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? 5000),
  ssl: process.env.DATABASE_SSL === "false" ? false : undefined,
});

// A failed idle connection is emitted by node-postgres separately from query
// promises. Handling it keeps a missing local database from crashing a page.
pool.on("error", (error) => {
  console.error("[database] unexpected pool error", error);
});
