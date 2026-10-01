import { NextResponse } from "next/server";
import { addDays, fromDbDate, todayISO, toDbDate } from "@/lib/dates";
import { BLOCKING_STATUSES } from "@/lib/reservation-status";
import { activeReservationWhere } from "@/server/booking/availability";
import { buildIcs } from "@/server/calendar/ics";
import { prisma } from "@/server/db";

/**
 * Our calendar for other channels (paste this URL into Airbnb → Calendar → Import calendar).
 * Contains only occupied ranges, no guest data. Events imported from other channels are left out
 * so a channel never receives its own bookings back.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/ical/[token]">) {
  const { token } = await params;
  const clean = token.replace(/\.ics$/, "");
  if (!/^[\w-]{20,80}$/.test(clean)) return new NextResponse(null, { status: 404 });
  const property = await prisma.property.findUnique({ where: { icalExportToken: clean }, select: { id: true, title: true } });
  if (!property) return new NextResponse(null, { status: 404 });

  const from = toDbDate(addDays(todayISO(), -30));
  const [reservations, blocks] = await Promise.all([
    prisma.reservation.findMany({
      where: { propertyId: property.id, checkOut: { gt: from }, status: { in: [...BLOCKING_STATUSES] }, ...activeReservationWhere() },
      select: { id: true, checkIn: true, checkOut: true },
    }),
    prisma.availability.findMany({ where: { propertyId: property.id, endDate: { gt: from } }, select: { id: true, startDate: true, endDate: true } }),
  ]);

  const ics = buildIcs(property.title, [
    ...reservations.map((r) => ({ uid: `${r.id}@destinocalamuchita`, summary: "Reservado", start: fromDbDate(r.checkIn), end: fromDbDate(r.checkOut), kind: "BOOKING" as const })),
    ...blocks.map((b) => ({ uid: `${b.id}@destinocalamuchita-block`, summary: "No disponible", start: fromDbDate(b.startDate), end: fromDbDate(b.endDate), kind: "BLOCKED" as const })),
  ]);

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
