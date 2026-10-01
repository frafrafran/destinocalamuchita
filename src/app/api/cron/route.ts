import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { completeFinishedStays, expireAllStaleHolds, sendCheckInReminders } from "@/server/booking/reservations";
import { purgeExpiredSessions } from "@/server/auth/session";
import { syncDueIntegrations } from "@/server/calendar/sync";
import { env } from "@/server/env";
import { dispatchNotifications } from "@/server/notifications";
import { purgeExpiredRateLimits } from "@/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * Periodic housekeeping. Call it every 10-30 minutes with `Authorization: Bearer <CRON_SECRET>`
 * (Vercel Cron sends that header automatically; see docs/GUIA-DE-USO.md for other schedulers).
 * Every task is idempotent, so overlapping or missed runs are harmless.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const started = Date.now();
  const result: Record<string, unknown> = {};

  const run = async (name: string, task: () => Promise<unknown>) => {
    try {
      result[name] = await task();
    } catch (error) {
      console.error(`[cron] ${name} failed`, error);
      result[name] = { error: error instanceof Error ? error.message : String(error) };
    }
  };

  await run("expiredHolds", expireAllStaleHolds);
  await run("completedStays", completeFinishedStays);
  await run("checkInReminders", sendCheckInReminders);
  await run("calendarSync", () => syncDueIntegrations(35_000));
  await run("notifications", () => dispatchNotifications());
  await run("cleanup", async () => ({ sessions: await purgeExpiredSessions(), rateLimits: await purgeExpiredRateLimits() }));

  return NextResponse.json({ ok: true, ms: Date.now() - started, ...result });
}
