import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import process from "node:process";
import pg from "pg";
import { loadConfig } from "../config.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 1 });
try {
  const sql = await readFile("migrations/001_initial.sql", "utf8");
  await pool.query(sql);
  process.stdout.write("Migração concluída.\n");
} finally {
  await pool.end();
}
