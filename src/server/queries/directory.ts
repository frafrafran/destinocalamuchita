import "server-only";
import type { Prisma, ProofStatus } from "@/generated/prisma/client";
import { findDuplicateProofs } from "../booking/proofs";
import { prisma } from "../db";

const PAGE_SIZE = 30;

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function listProofs(status: ProofStatus | "ALL", page: number) {
  const where: Prisma.PaymentProofWhereInput = status === "ALL" ? {} : { status };
  const [items, total, counts] = await Promise.all([
    prisma.paymentProof.findMany({
      where,
      orderBy: { uploadedAt: status === "PENDING_REVIEW" ? "asc" : "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        reviewedBy: { select: { name: true } },
        payment: { include: { reservation: { include: { guest: true, property: { select: { title: true } } } } } },
      },
    }),
    prisma.paymentProof.count({ where }),
    prisma.paymentProof.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const duplicates = await findDuplicateProofs(items.map((item) => item.id));
  return {
    items,
    duplicates,
    total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])) as Partial<Record<ProofStatus, number>>,
  };
}

// ─── Guests ───────────────────────────────────────────────────────────────────

export async function listGuests(q: string | undefined, page: number) {
  const where: Prisma.GuestWhereInput = q
    ? {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    prisma.guest.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: { select: { reservations: true } },
        reservations: { orderBy: { checkIn: "desc" }, take: 1, select: { checkIn: true, property: { select: { title: true } } } },
      },
    }),
    prisma.guest.count({ where }),
  ]);
  return { items, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getGuest(id: string) {
  return prisma.guest.findUnique({
    where: { id },
    include: {
      reservations: { orderBy: { checkIn: "desc" }, include: { property: { select: { title: true } } } },
    },
  });
}

// ─── Owners ───────────────────────────────────────────────────────────────────

export async function listOwners() {
  return prisma.owner.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { properties: { select: { id: true, title: true, status: true } }, user: { select: { email: true } } },
  });
}

export async function getOwner(id: string) {
  return prisma.owner.findUnique({
    where: { id },
    include: { properties: { select: { id: true, title: true, status: true } }, user: { select: { id: true, email: true } } },
  });
}
