import "server-only";
import type { Prisma, ReservationStatus } from "@/generated/prisma/client";
import { type ISODate, addDays, addMonths, daysInMonth, diffDays, fromDbDate, maxDate, minDate, startOfMonth, toDbDate, todayISO } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { BLOCKING_STATUSES } from "@/lib/reservation-status";
import { propertyScope } from "../auth/guard";
import type { SessionUser } from "../auth/session";
import { prisma } from "../db";

const reservationScope = (user: SessionUser): Prisma.ReservationWhereInput =>
  user.role === "OWNER" ? { property: propertyScope(user) } : {};

// ─── Shell ────────────────────────────────────────────────────────────────────

export async function getShellCounts(user: SessionUser) {
  const scope = reservationScope(user);
  const [proofs, awaiting, conflicts, unread] = await Promise.all([
    prisma.paymentProof.count({ where: { status: "PENDING_REVIEW", payment: { reservation: scope } } }),
    prisma.reservation.count({ where: { ...scope, status: { in: ["PENDING", "AWAITING_PAYMENT"] } } }),
    prisma.reservation.count({ where: { ...scope, hasConflict: true, status: { in: [...BLOCKING_STATUSES] } } }),
    prisma.notification.count({ where: { userId: user.id, channel: "IN_APP", readAt: null } }),
  ]);
  return { proofs, awaiting, conflicts, unread };
}

export async function getNotifications(user: SessionUser, take = 12) {
  return prisma.notification.findMany({
    where: { userId: user.id, channel: "IN_APP" },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, template: true, payload: true, readAt: true, createdAt: true, reservationId: true },
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

const REVENUE_STATUSES: ReservationStatus[] = ["CONFIRMED", "COMPLETED"];

/** Nights of [start, end) that fall inside [from, to). */
function overlapNights(start: ISODate, end: ISODate, from: ISODate, to: ISODate): number {
  const a = maxDate(start, from);
  const b = minDate(end, to);
  return a < b ? diffDays(a, b) : 0;
}

export async function getDashboard(user: SessionUser) {
  const today = todayISO();
  const monthStart = startOfMonth(today);
  const nextMonth = addMonths(monthStart, 1);
  const prevMonth = addMonths(monthStart, -1);
  const chartStart = addMonths(monthStart, -11);
  const scope = reservationScope(user);
  const properties = await prisma.property.findMany({
    where: { ...propertyScope(user), status: { in: ["PUBLISHED", "PAUSED"] } },
    select: { id: true, title: true, status: true },
    orderBy: { title: "asc" },
  });
  const propertyIds = properties.map((p) => p.id);

  const [reservations, externalEvents, proofs, recent, arrivals, departures, conflicts] = await Promise.all([
    prisma.reservation.findMany({
      where: { ...scope, status: { in: [...BLOCKING_STATUSES] }, checkOut: { gt: toDbDate(chartStart) }, checkIn: { lt: toDbDate(addMonths(monthStart, 3)) } },
      select: { id: true, propertyId: true, status: true, source: true, checkIn: true, checkOut: true, total: true, currency: true, createdAt: true },
    }),
    prisma.calendarEvent.findMany({
      where: { propertyId: { in: propertyIds }, integration: { isActive: true }, endDate: { gt: toDbDate(chartStart) } },
      select: { propertyId: true, startDate: true, endDate: true, kind: true, integration: { select: { channel: true } } },
    }),
    prisma.paymentProof.findMany({
      where: { status: "PENDING_REVIEW", payment: { reservation: scope } },
      orderBy: { uploadedAt: "asc" },
      take: 6,
      include: { payment: { include: { reservation: { include: { guest: true, property: { select: { title: true } } } } } } },
    }),
    prisma.reservation.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { guest: true, property: { select: { title: true } } },
    }),
    prisma.reservation.findMany({
      where: { ...scope, status: { in: ["CONFIRMED", "PROOF_RECEIVED", "UNDER_REVIEW", "AWAITING_PAYMENT"] }, checkIn: { gte: toDbDate(today), lt: toDbDate(addDays(today, 8)) } },
      orderBy: { checkIn: "asc" },
      include: { guest: true, property: { select: { title: true, checkInTime: true } } },
    }),
    prisma.reservation.findMany({
      where: { ...scope, status: "CONFIRMED", checkOut: { gte: toDbDate(today), lt: toDbDate(addDays(today, 8)) } },
      orderBy: { checkOut: "asc" },
      include: { guest: true, property: { select: { title: true, checkOutTime: true } } },
    }),
    prisma.reservation.findMany({
      where: { ...scope, hasConflict: true, status: { in: [...BLOCKING_STATUSES] } },
      include: { property: { select: { title: true } } },
    }),
  ]);

  const confirmed = reservations.filter((r) => REVENUE_STATUSES.includes(r.status));
  const revenueIn = (from: ISODate, to: ISODate) =>
    confirmed.filter((r) => fromDbDate(r.checkIn) >= from && fromDbDate(r.checkIn) < to).reduce((sum, r) => sum + toCents(r.total), 0);

  // Occupancy counts every occupied night, whatever the channel.
  const occupiedNightsIn = (propertyId: string | null, from: ISODate, to: ISODate) => {
    const own = reservations
      .filter((r) => (propertyId ? r.propertyId === propertyId : true))
      .reduce((sum, r) => sum + overlapNights(fromDbDate(r.checkIn), fromDbDate(r.checkOut), from, to), 0);
    const external = externalEvents
      .filter((e) => (propertyId ? e.propertyId === propertyId : true))
      .reduce((sum, e) => sum + overlapNights(fromDbDate(e.startDate), fromDbDate(e.endDate), from, to), 0);
    return own + external;
  };
  const monthNights = daysInMonth(monthStart);
  const capacity = Math.max(properties.length * monthNights, 1);
  const occupancy = occupiedNightsIn(null, monthStart, nextMonth) / capacity;
  const prevOccupancy = occupiedNightsIn(null, prevMonth, monthStart) / Math.max(properties.length * daysInMonth(prevMonth), 1);

  const months = Array.from({ length: 12 }, (_, i) => addMonths(chartStart, i));
  const monthly = months.map((month) => {
    const end = addMonths(month, 1);
    return {
      month,
      revenue: revenueIn(month, end),
      bookings: reservations.filter((r) => fromDbDate(r.checkIn) >= month && fromDbDate(r.checkIn) < end).length,
      occupancy: occupiedNightsIn(null, month, end) / Math.max(properties.length * daysInMonth(month), 1),
    };
  });

  const byProperty = properties.map((property) => ({
    id: property.id,
    title: property.title,
    occupancy: occupiedNightsIn(property.id, monthStart, nextMonth) / monthNights,
  }));

  const sources = {
    direct: reservations.filter((r) => r.source === "DIRECT").length,
    manual: reservations.filter((r) => r.source === "MANUAL").length,
    airbnb: externalEvents.filter((e) => e.kind === "BOOKING" && e.integration.channel === "AIRBNB").length,
    other: externalEvents.filter((e) => e.kind === "BOOKING" && e.integration.channel !== "AIRBNB").length,
  };

  const occupiedToday = new Set([
    ...reservations.filter((r) => fromDbDate(r.checkIn) <= today && fromDbDate(r.checkOut) > today).map((r) => r.propertyId),
    ...externalEvents.filter((e) => fromDbDate(e.startDate) <= today && fromDbDate(e.endDate) > today).map((e) => e.propertyId),
  ]);

  return {
    today,
    monthStart,
    kpis: {
      revenue: revenueIn(monthStart, nextMonth),
      prevRevenue: revenueIn(prevMonth, monthStart),
      bookings: reservations.filter((r) => fromDbDate(r.checkIn) >= monthStart && fromDbDate(r.checkIn) < nextMonth).length,
      occupancy,
      prevOccupancy,
      pendingProofs: await prisma.paymentProof.count({ where: { status: "PENDING_REVIEW", payment: { reservation: scope } } }),
      awaitingPayment: reservations.filter((r) => r.status === "AWAITING_PAYMENT" || r.status === "PENDING").length,
      inHouse: reservations.filter((r) => r.status === "CONFIRMED" && fromDbDate(r.checkIn) <= today && fromDbDate(r.checkOut) > today).length,
      occupiedToday: occupiedToday.size,
      availableToday: properties.filter((p) => p.status === "PUBLISHED" && !occupiedToday.has(p.id)).length,
    },
    monthly,
    byProperty,
    sources,
    proofs,
    recent,
    arrivals,
    departures,
    conflicts,
    currency: confirmed[0]?.currency ?? "ARS",
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

