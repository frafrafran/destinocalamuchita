/**
 * Local PostgreSQL for development, no Docker or system install needed.
 * Runs a real PostgreSQL 18 server from the `embedded-postgres` binaries and keeps it
 * alive until you press Ctrl+C. Data persists in `.data/postgres`.
 *
 *   npm run db:local
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://remanso:remanso@localhost:5433/remanso");
const databaseDir = path.resolve(".data/postgres");
const database = url.pathname.replace(/^\//, "") || "remanso";

const pg = new EmbeddedPostgres({
  databaseDir,
  port: Number(url.port || 5433),
  user: decodeURIComponent(url.username || "remanso"),
  password: decodeURIComponent(url.password || "remanso"),
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

async function main() {
  const firstRun = !existsSync(path.join(databaseDir, "PG_VERSION"));
  if (firstRun) {
    console.log(`Initialising PostgreSQL cluster in ${databaseDir}`);
    await pg.initialise();
  }
  await pg.start();

  const client = pg.getPgClient("postgres", url.hostname);
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
  await client.end();
  if (exists.rowCount === 0) {
    await pg.createDatabase(database);
    console.log(`Created database "${database}"`);
  }

  console.log(`PostgreSQL ready on ${url.hostname}:${url.port} (database "${database}"). Ctrl+C to stop.`);

  const shutdown = async () => {
    console.log("\nStopping PostgreSQL…");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  // Keep the event loop alive while the server runs.
  setInterval(() => undefined, 1 << 30);
}

main().catch(async (error) => {
  console.error(error);
  await pg.stop().catch(() => undefined);
  process.exit(1);
});
