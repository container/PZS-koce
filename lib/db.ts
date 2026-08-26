import { Pool } from "pg";

export const pool = new Pool({
  // Do not throw at module load: Next evaluates route modules during `next build`.
  // PostgreSQL will fail loudly on the first request if Railway has not provided it.
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DATABASE_POOL_MAX ?? 5),
  ssl: process.env.DATABASE_SSL === "false" ? false : undefined,
});
