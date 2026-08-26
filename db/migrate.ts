import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { pool } = await import("@/lib/db");
  const migrationsDirectory = join(process.cwd(), "db/migrations");
  const migrations = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const migration of migrations) {
    const sql = await readFile(join(migrationsDirectory, migration), "utf8");
    await pool.query(sql);
  }
  await pool.end();
}

main().catch((error) => {
  console.error("Migration failed", error);
  process.exitCode = 1;
});
