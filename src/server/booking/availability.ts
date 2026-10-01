import "server-only";
import type {
  AvailabilityReason,
  CalendarChannel,
  CalendarEventKind,
  Prisma,
  ReservationStatus,
} from "@/generated/prisma/client";
import type { BlockedRange } from "@/lib/availability";
import { type ISODate, fromDbDate, toDbDate } from "@/lib/dates";
import { BLOCKING_STATUSES, EXPIRING_STATUSES } from "@/lib/reservation-status";
import type { Db } from "../db";

export type DetailedRange = BlockedRange &
  (
    | { kind: "RESERVATION"; id: string; code: string; status: ReservationStatus; guestName: string; hasConflict: boolean }
    | { kind: "BLOCK"; id: string; reason: AvailabilityReason; note: string | null }
    | { kind: "EXTERNAL"; id: string; channel: CalendarChannel; eventKind: CalendarEventKind; summary: string; hasConflict: boolean }
  );

/** Holds whose deadline passed are treated as free even before the sweeper marks them EXPIRED. */
export function activeReservationWhere(now = new Date()): Prisma.ReservationWhereInput {
  return {
    status: { in: [...BLOCKING_STATUSES] },
    NOT: { status: { in: [...EXPIRING_STATUSES] }, holdExpiresAt: { lt: now } },
  };
}

/** Everything occupying nights of the given properties within [from, to). */
export async function loadBlockedRanges(
  db: Db,
  propertyIds: string[],
  from: ISODate,
  to: ISODate,
  options: { excludeReservationId?: string } = {},
): Promise<Map<string, DetailedRange[]>> {
  const fromDate = toDbDate(from);
  const toDate = toDbDate(to);
  const overlap = { startDate: { lt: toDate }, endDate: { gt: fromDate } };

  // Sequential on purpose: `db` is often a transaction client, which runs one query at a time.
  const reservations = await db.reservation.findMany({
    where: {
      propertyId: { in: propertyIds },
      checkIn: { lt: toDate },
      checkOut: { gt: fromDate },
      ...activeReservationWhere(),
      ...(options.excludeReservationId ? { id: { not: options.excludeReservationId } } : {}),
    },
    select: {
      id: true,
      propertyId: true,
      code: true,
      status: true,
      checkIn: true,
      checkOut: true,
      hasConflict: true,
      guest: { select: { firstName: true, lastName: true } },
    },
  });
  const blocks = await db.availability.findMany({ where: { propertyId: { in: propertyIds }, ...overlap } });
  const events = await db.calendarEvent.findMany({
    where: { propertyId: { in: propertyIds }, ...overlap, integration: { isActive: true } },
    include: { integration: { select: { channel: true } } },
  });

  const map = new Map<string, DetailedRange[]>(propertyIds.map((id) => [id, []]));
  for (const r of reservations) {
    map.get(r.propertyId)!.push({
      kind: "RESERVATION",
      id: r.id,
      start: fromDbDate(r.checkIn),
      end: fromDbDate(r.checkOut),
      code: r.code,
      status: r.status,
      guestName: `${r.guest.firstName} ${r.guest.lastName}`,
      hasConflict: r.hasConflict,
    });
  }
  for (const b of blocks) {
    map.get(b.propertyId)!.push({
      kind: "BLOCK",
      id: b.id,
      start: fromDbDate(b.startDate),
      end: fromDbDate(b.endDate),
      reason: b.reason,
      note: b.note,
    });
  }
  for (const e of events) {
    map.get(e.propertyId)!.push({
      kind: "EXTERNAL",
      id: e.id,
      start: fromDbDate(e.startDate),
      end: fromDbDate(e.endDate),
      channel: e.integration.channel,
      eventKind: e.kind,
      summary: e.summary,
      hasConflict: e.hasConflict,
    });
  }
  for (const ranges of map.values()) ranges.sort((a, b) => a.start.localeCompare(b.start));
  return map;
}

export async function loadPropertyRanges(
  db: Db,
  propertyId: string,
  from: ISODate,
  to: ISODate,
  options: { excludeReservationId?: string } = {},
): Promise<DetailedRange[]> {
  return (await loadBlockedRanges(db, [propertyId], from, to, options)).get(propertyId) ?? [];
}

/** Public projection: only dates, never who or why. */
export function toPublicRanges(ranges: DetailedRange[]): BlockedRange[] {
  return ranges.map(({ start, end, kind }) => ({ start, end, kind }));
}
