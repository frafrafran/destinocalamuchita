import { NextResponse } from "next/server";
import { fromDbDate } from "@/lib/dates";
import { isValidGuestToken, readGuestAccessCookie } from "@/server/booking/guest-access";
import { buildIcs } from "@/server/calendar/ics";
import { prisma } from "@/server/db";

/** "Add to my calendar" for a confirmed stay (guest cookie required). */
export async function GET(_request: Request, { params }: RouteContext<"/api/reservations/[code]/calendar">) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  const reservation = await prisma.reservation.findUnique({
    where: { code },
    include: { property: { select: { title: true, address: true, city: true } } },
  });
  if (!reservation || !isValidGuestToken(reservation, await readGuestAccessCookie(code))) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (reservation.status !== "CONFIRMED" && reservation.status !== "COMPLETED") {
    return NextResponse.json({ error: "INVALID_STATE" }, { status: 409 });
  }

  const summary = `${reservation.property.title} (${reservation.code})`;
  const ics = buildIcs(reservation.property.title, [
    {
      uid: `${reservation.id}@destinocalamuchita-guest`,
      summary: `${summary}${reservation.property.address ? ` - ${reservation.property.address}, ${reservation.property.city}` : ""}`,
      start: fromDbDate(reservation.checkIn),
      end: fromDbDate(reservation.checkOut),
      kind: "BOOKING",
    },
  ]);
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reservation.code}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
