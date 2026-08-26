import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pool } from "@/lib/db";

async function main() {
  const sql = await readFile(join(process.cwd(), "db/migrations/001_availability.sql"), "utf8");
  await pool.query(sql);
  await pool.end();
}

main().catch((error) => {
  console.error("Migration failed", error);
  process.exitCode = 1;
});
