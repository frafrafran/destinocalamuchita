/**
 * Creates the test database (if needed) and applies every migration before the suite runs.
 * Requires the development PostgreSQL to be running (`npm run db:local`).
 */
import { execSync } from "node:child_process";
import pg from "pg";
import { testDatabaseUrl } from "./test-env";

export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const database = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";

  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
  if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${database.replace(/"/g, "")}"`);
  await client.end();

  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url.toString() } });
}
