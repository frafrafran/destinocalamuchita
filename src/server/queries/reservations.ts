import "server-only";
import type { Prisma, ReservationStatus } from "@/generated/prisma/client";
import { type ISODate, isValidISODate, toDbDate } from "@/lib/dates";
import { propertyScope } from "../auth/guard";
import type { SessionUser } from "../auth/session";
import { findDuplicateProofs } from "../booking/proofs";
import { prisma } from "../db";

export const RESERVATIONS_PAGE_SIZE = 25;

export interface ReservationFilters {
  q?: string;
  status?: ReservationStatus | "attention";
  propertyId?: string;
  from?: ISODate;
  to?: ISODate;
  page?: number;
}

export function reservationWhere(user: SessionUser, filters: ReservationFilters): Prisma.ReservationWhereInput {
  const and: Prisma.ReservationWhereInput[] = [];
  if (user.role === "OWNER") and.push({ property: propertyScope(user) });
  if (filters.status === "attention") {
    and.push({ OR: [{ status: { in: ["PROOF_RECEIVED", "UNDER_REVIEW"] } }, { hasConflict: true, status: { notIn: ["CANCELLED", "REJECTED", "EXPIRED"] } }] });
  } else if (filters.status) {
    and.push({ status: filters.status });
  }
  if (filters.propertyId) and.push({ propertyId: filters.propertyId });
  if (filters.from && isValidISODate(filters.from)) and.push({ checkOut: { gt: toDbDate(filters.from) } });
  if (filters.to && isValidISODate(filters.to)) and.push({ checkIn: { lt: toDbDate(filters.to) } });
  if (filters.q) {
    const q = filters.q.trim().slice(0, 80);
    and.push({
      OR: [
        { code: { contains: q.toUpperCase() } },
        { guest: { email: { contains: q, mode: "insensitive" } } },
        { guest: { firstName: { contains: q, mode: "insensitive" } } },
        { guest: { lastName: { contains: q, mode: "insensitive" } } },
        { guest: { phone: { contains: q } } },
        { property: { title: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

export async function listReservations(user: SessionUser, filters: ReservationFilters) {
  const where = reservationWhere(user, filters);
  const page = Math.max(1, filters.page ?? 1);
  const [items, total, statusCounts] = await Promise.all([
    prisma.reservation.findMany({
      where,
      orderBy: [{ checkIn: "desc" }],
      skip: (page - 1) * RESERVATIONS_PAGE_SIZE,
      take: RESERVATIONS_PAGE_SIZE,
      include: { guest: true, property: { select: { id: true, title: true } }, payments: { include: { _count: { select: { proofs: true } } } } },
    }),
    prisma.reservation.count({ where }),
    prisma.reservation.groupBy({ by: ["status"], where: reservationWhere(user, { ...filters, status: undefined }), _count: { _all: true } }),
  ]);
  return {
    items,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / RESERVATIONS_PAGE_SIZE)),
    statusCounts: Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all])) as Partial<Record<ReservationStatus, number>>,
  };
}

export async function getReservationDetail(user: SessionUser, id: string) {
  const reservation = await prisma.reservation.findFirst({
    where: { id, ...(user.role === "OWNER" ? { property: propertyScope(user) } : {}) },
    include: {
      guest: { include: { _count: { select: { reservations: true } } } },
      property: { select: { id: true, title: true, slug: true, city: true, currency: true, maxGuests: true } },
      createdBy: { select: { name: true } },
      payments: {
        orderBy: { createdAt: "asc" },
        include: { verifiedBy: { select: { name: true } }, proofs: { orderBy: { uploadedAt: "desc" }, include: { reviewedBy: { select: { name: true } } } } },
      },
    },
  });
  if (!reservation) return null;

  const proofIds = reservation.payments.flatMap((payment) => payment.proofs.map((proof) => proof.id));
  const [duplicates, activity, notifications] = await Promise.all([
    findDuplicateProofs(proofIds),
    prisma.auditLog.findMany({
      where: { OR: [{ entityType: "Reservation", entityId: reservation.id }, { entityType: "PaymentProof", entityId: { in: proofIds } }] },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { actor: { select: { name: true } } },
    }),
    prisma.notification.findMany({
      where: { reservationId: reservation.id, channel: { not: "IN_APP" } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, template: true, recipient: true, status: true, createdAt: true, lastError: true },
    }),
  ]);
  return { reservation, duplicates, activity, notifications };
}

export type ReservationDetail = NonNullable<Awaited<ReturnType<typeof getReservationDetail>>>;

export async function listPropertyOptions(user: SessionUser) {
  return prisma.property.findMany({
    where: { ...propertyScope(user), status: { not: "ARCHIVED" } },
    select: { id: true, title: true, maxGuests: true, currency: true, status: true },
    orderBy: { title: "asc" },
  });
}
