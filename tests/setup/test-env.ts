/**
 * Loaded before every test file: points the app at a dedicated `<db>_test` database so tests
 * never touch development data.
 */
import "dotenv/config";

export function testDatabaseUrl(): string {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://remanso:remanso@localhost:5433/remanso");
  if (!url.pathname.endsWith("_test")) url.pathname = `${url.pathname}_test`;
  return url.toString();
}

process.env.DATABASE_URL = testDatabaseUrl();
process.env.APP_URL ??= "http://localhost:3000";
process.env.CRON_SECRET ??= "test-cron-secret-0123456789";
process.env.APP_SECRET ??= "test-app-secret-0123456789-0123456789-abcdef";
process.env.EMAIL_FROM ??= "DestinoCalamuchita <test@example.com>";
process.env.EMAIL_DRIVER = "console";
process.env.STORAGE_DRIVER = "local";
