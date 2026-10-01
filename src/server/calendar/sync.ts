import "server-only";
import { addDays, fromDbDate, PROPERTY_TIME_ZONE, rangesOverlap, toDbDate, todayISO } from "@/lib/dates";
import { OPEN_STATUSES } from "@/lib/reservation-status";
import { SYSTEM_ACTOR, audit } from "../audit";
import { reservationPayload } from "../booking/payload";
import { lockProperty } from "../booking/locks";
import { prisma } from "../db";
import { env } from "../env";
import { dispatchNotifications, queueStaffAlert } from "../notifications";
import { CHANNELS } from "./channels";
import { parseIcs } from "./ics";
import { safeFetchText } from "./safe-fetch";

const ALERT_AFTER_FAILURES = 3;

export type SyncOutcome =
  | { ok: true; events: number; added: number; removed: number; newConflicts: number }
  | { ok: false; error: string };

/**
 * Imports one channel feed. On any fetch/parse error the previously imported events are kept
 * untouched (a feed being down must never free dates that are actually taken).
 */
export async function syncIntegration(integrationId: string): Promise<SyncOutcome> {
  const integration = await prisma.calendarIntegration.findUnique({
    where: { id: integrationId },
    include: { property: { select: { id: true, title: true } } },
  });
  if (!integration) return { ok: false, error: "NOT_FOUND" };

  let parsed;
  try {
    const text = await safeFetchText(integration.importUrl);
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Response is not an iCalendar feed");
    parsed = parseIcs(text, PROPERTY_TIME_ZONE);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const updated = await prisma.calendarIntegration.update({
      where: { id: integration.id },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: "FAILED",
        lastSyncError: message.slice(0, 500),
        consecutiveFailures: { increment: 1 },
      },
    });
    if (updated.consecutiveFailures === ALERT_AFTER_FAILURES) {
      const ids = await queueStaffAlert(prisma, "ADMIN_SYNC_FAILING", {
        propertyTitle: integration.property.title,
        channel: CHANNELS[integration.channel].label,
        error: message.slice(0, 300),
      });
      await dispatchNotifications(ids);
    }
    return { ok: false, error: message };
  }

  // Only present and future stays matter for availability.
  const today = todayISO();
  const horizonStart = addDays(today, -1);
  const adapter = CHANNELS[integration.channel];
  const events = parsed.filter((event) => event.end > horizonStart);

  const result = await prisma.$transaction(
    async (tx) => {
      await lockProperty(tx, integration.propertyId);

      const existing = await tx.calendarEvent.findMany({ where: { integrationId: integration.id }, select: { externalId: true } });
      const existingIds = new Set(existing.map((event) => event.externalId));
      const incomingIds = new Set(events.map((event) => event.externalId));

      const removed = await tx.calendarEvent.deleteMany({
        where: { integrationId: integration.id, externalId: { notIn: [...incomingIds] } },
      });

      const now = new Date();
      for (const event of events) {
        const data = {
          summary: event.summary,
          kind: adapter.classify(event.summary),
          startDate: toDbDate(event.start),
          endDate: toDbDate(event.end),
          lastSeenAt: now,
        };
        await tx.calendarEvent.upsert({
          where: { integrationId_externalId: { integrationId: integration.id, externalId: event.externalId } },
          create: { ...data, integrationId: integration.id, propertyId: integration.propertyId, externalId: event.externalId },
          update: data,
        });
      }

      // Recompute conflicts between local open reservations and every active external event.
      const reservations = await tx.reservation.findMany({
        where: { propertyId: integration.propertyId, status: { in: [...OPEN_STATUSES] }, checkOut: { gt: toDbDate(today) } },
        include: { guest: true, property: { select: { title: true, checkInTime: true, checkOutTime: true } } },
      });
      const activeEvents = await tx.calendarEvent.findMany({ where: { propertyId: integration.propertyId, integration: { isActive: true } } });

      let newConflicts = 0;
      const conflictingEventIds = new Set<string>();
      for (const reservation of reservations) {
        const start = fromDbDate(reservation.checkIn);
        const end = fromDbDate(reservation.checkOut);
        const overlapping = activeEvents.filter((event) => rangesOverlap(start, end, fromDbDate(event.startDate), fromDbDate(event.endDate)));
        overlapping.forEach((event) => conflictingEventIds.add(event.id));
        const hasConflict = overlapping.length > 0;
        if (hasConflict !== reservation.hasConflict) {
          await tx.reservation.update({ where: { id: reservation.id }, data: { hasConflict } });
          if (hasConflict) {
            newConflicts++;
            await audit(tx, SYSTEM_ACTOR, "reservation.calendar_conflict", { type: "Reservation", id: reservation.id }, {
              channel: integration.channel,
            });
            await queueStaffAlert(tx, "ADMIN_CALENDAR_CONFLICT", reservationPayload(reservation, { channel: adapter.label }), reservation.id);
          }
        }
      }
      await tx.calendarEvent.updateMany({
        where: { propertyId: integration.propertyId, id: { in: [...conflictingEventIds] } },
        data: { hasConflict: true },
      });
      await tx.calendarEvent.updateMany({
        where: { propertyId: integration.propertyId, id: { notIn: [...conflictingEventIds] }, hasConflict: true },
        data: { hasConflict: false },
      });

      await tx.calendarIntegration.update({
        where: { id: integration.id },
        data: {
          lastSyncedAt: now,
          lastSyncStatus: "SUCCESS",
          lastSyncError: null,
          lastEventCount: events.length,
          consecutiveFailures: 0,
        },
      });

      return {
        events: events.length,
        added: [...incomingIds].filter((id) => !existingIds.has(id)).length,
        removed: removed.count,
        newConflicts,
      };
    },
    { timeout: 30_000 },
  );

  if (result.newConflicts > 0) await dispatchNotifications();
  return { ok: true, ...result };
}

/** Cron: syncs every active feed not refreshed within ICAL_SYNC_INTERVAL_MINUTES. */
export async function syncDueIntegrations(budgetMs = 45_000): Promise<{ synced: number; failed: number }> {
  const threshold = new Date(Date.now() - env.ICAL_SYNC_INTERVAL_MINUTES * 60_000);
  const due = await prisma.calendarIntegration.findMany({
    where: { isActive: true, OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: threshold } }] },
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
    select: { id: true },
  });
  const deadline = Date.now() + budgetMs;
  let synced = 0;
  let failed = 0;
  for (const { id } of due) {
    if (Date.now() > deadline) break;
    const outcome = await syncIntegration(id);
    if (outcome.ok) synced++;
    else failed++;
  }
  return { synced, failed };
}

/**
 * Called right before a reservation is created: refreshes this property's feeds if they are older
 * than `maxAgeMinutes`, bounded by a short timeout so a slow channel never blocks a booking.
 */
export async function refreshPropertyFeedsIfStale(propertyId: string, maxAgeMinutes = 15, timeoutMs = 6_000): Promise<void> {
  const threshold = new Date(Date.now() - maxAgeMinutes * 60_000);
  const stale = await prisma.calendarIntegration.findMany({
    where: { propertyId, isActive: true, OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: threshold } }] },
    select: { id: true },
  });
  if (stale.length === 0) return;
  await Promise.race([
    Promise.allSettled(stale.map(({ id }) => syncIntegration(id))),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
