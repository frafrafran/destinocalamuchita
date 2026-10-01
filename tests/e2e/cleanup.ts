import "dotenv/config";
import { rm } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

/** Every booking made by the e2e tests uses this address pattern (example.com is reserved for testing). */
export const TEST_EMAIL_PATTERN = "e2e+%@example.com";

/**
 * Deletes the bookings created by the e2e tests, whether they passed or failed, so their nights never stay held.
 * Touches nothing else: demo and real guests never match the pattern. The audit log is left intact on purpose.
 */
export async function removeTestBookings(): Promise<number> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    const { rows: reservations } = await client.query<{ id: string }>(
      `SELECT r.id FROM "Reservation" r JOIN "Guest" g ON g.id = r."guestId" WHERE g.email LIKE $1`,
      [TEST_EMAIL_PATTERN],
    );
    const ids = reservations.map((row) => row.id);
    const { rows: files } = await client.query<{ storageKey: string }>(
      `SELECT pp."storageKey" FROM "PaymentProof" pp JOIN "Payment" p ON p.id = pp."paymentId" WHERE p."reservationId" = ANY($1)`,
      [ids],
    );
    await client.query(`DELETE FROM "Notification" WHERE "reservationId" = ANY($1)`, [ids]);
    await client.query(`DELETE FROM "Reservation" WHERE id = ANY($1)`, [ids]);
    await client.query(`DELETE FROM "Guest" WHERE email LIKE $1`, [TEST_EMAIL_PATTERN]);
    await client.query("COMMIT");

    // Receipts of local storage live on disk; with S3 they stay in the private bucket (harmless test images).
    if ((process.env.STORAGE_DRIVER ?? "local") === "local") {
      const bucket = path.resolve("storage", "private");
      for (const { storageKey } of files) {
        const file = path.resolve(bucket, storageKey);
        if (!file.startsWith(bucket + path.sep)) continue;
        await rm(file, { force: true });
        await rm(`${file}.meta`, { force: true });
      }
    }
    return ids.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
