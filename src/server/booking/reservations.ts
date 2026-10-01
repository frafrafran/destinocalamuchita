import "server-only";
import { randomInt } from "node:crypto";
import type { Owner, Prisma, ReservationStatus } from "@/generated/prisma/client";
import { findConflicts } from "@/lib/availability";
import { type ISODate, addDays, fromDbDate, toDbDate, todayISO } from "@/lib/dates";
import { centsToDecimalString, toCents } from "@/lib/money";
import { type PricingConfig, type Quote, calculateQuote } from "@/lib/pricing";
import { EXPIRING_STATUSES, OPEN_STATUSES } from "@/lib/reservation-status";
import { ActionError } from "../action-result";
import { type AuditActor, audit } from "../audit";
import { type Tx, isExclusionViolation, prisma } from "../db";
import { queueGuestNotification, queueStaffAlert } from "../notifications";
import type { BankDetails } from "../notifications/templates";
import { type Settings, loadSettings } from "../settings";
import { refreshPropertyFeedsIfStale } from "../calendar/sync";
import { loadPropertyRanges } from "./availability";
import { expireStaleHolds, lockProperty } from "./locks";
import { reservationPayload } from "./payload";
import { toPricingConfig } from "./pricing-config";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function generateReservationCode(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    let code = "RMS-";
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    const taken = await tx.reservation.findUnique({ where: { code }, select: { id: true } });
    if (!taken) return code;
  }
  throw new Error("Could not generate a unique reservation code");
}

/** Owner account if configured, otherwise the agency account from Settings. */
export function resolveBankDetails(owner: Pick<Owner, "bankName" | "accountHolder" | "cbu" | "alias" | "accountTaxId"> | null, settings: Settings): BankDetails | null {
  const source = owner && (owner.cbu || owner.alias) ? owner : settings.bank;
  if (!source.cbu && !source.alias) return null;
  return {
    bankName: source.bankName ?? "",
    accountHolder: source.accountHolder ?? "",
    cbu: source.cbu ?? "",
    alias: source.alias ?? "",
    accountTaxId: source.accountTaxId ?? "",
  };
}

function holdDeadline(settings: Settings): Date {
  return new Date(Date.now() + settings.booking.holdHours * 3_600_000);
}

function quoteColumns(quote: Quote) {
  return {
    nights: quote.nights,
    nightlySubtotal: centsToDecimalString(quote.nightlySubtotal),
    discountTotal: centsToDecimalString(quote.discount?.amount ?? 0),
    feesTotal: centsToDecimalString(quote.feesTotal),
    cleaningFee: centsToDecimalString(quote.cleaningFee),
    total: centsToDecimalString(quote.total),
    priceBreakdown: quote as unknown as Prisma.InputJsonValue,
  };
}

async function loadPropertyForBooking(tx: Tx, propertyId: string) {
  const property = await tx.property.findUnique({
    where: { id: propertyId },
    include: { owner: true, seasons: true, priceRules: true },
  });
  if (!property) throw new ActionError("NOT_FOUND");
  return property;
}

/** Throws DATES_UNAVAILABLE unless every night of [checkIn, checkOut) is free. Call under lockProperty. */
async function assertAvailable(tx: Tx, propertyId: string, checkIn: ISODate, checkOut: ISODate, excludeReservationId?: string) {
  const ranges = await loadPropertyRanges(tx, propertyId, checkIn, checkOut, { excludeReservationId });
  const conflicts = findConflicts(ranges, checkIn, checkOut);
  if (conflicts.length > 0) {
    throw new ActionError("DATES_UNAVAILABLE", { conflicts: conflicts.map(({ kind, start, end }) => ({ kind, start, end })) });
  }
}

async function upsertGuest(tx: Tx, guest: GuestInput) {
  const email = guest.email.trim().toLowerCase();
  return tx.guest.upsert({
    where: { email },
    create: { email, firstName: guest.firstName, lastName: guest.lastName, phone: guest.phone, country: guest.country ?? null },
    update: { firstName: guest.firstName, lastName: guest.lastName, phone: guest.phone, ...(guest.country ? { country: guest.country } : {}) },
  });
}

function quoteError(result: ReturnType<typeof calculateQuote>): never {
  if (result.ok) throw new Error("unreachable");
  throw new ActionError("QUOTE", { ...result.error });
}

/** Runs a booking transaction, translating the database's overlap guard into DATES_UNAVAILABLE. */
async function bookingTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(fn, { isolationLevel: "ReadCommitted", timeout: 20_000, maxWait: 10_000 });
  } catch (error) {
    if (isExclusionViolation(error)) throw new ActionError("DATES_UNAVAILABLE");
    throw error;
  }
}

// ─── Guest booking ────────────────────────────────────────────────────────────

export interface GuestInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country?: string | null;
}

export interface DirectBookingInput {
  propertyId: string;
  checkIn: ISODate;
  checkOut: ISODate;
  guests: number;
  guest: GuestInput;
  comments: string | null;
  locale: string;
  /** Total the guest saw (cents). If the server computes something else, the booking stops. */
  expectedTotal: number;
}

export interface BookingResult {
  id: string;
  code: string;
  accessVersion: number;
  locale: string;
  notificationIds: string[];
}

export async function createDirectReservation(input: DirectBookingInput, actor: AuditActor): Promise<BookingResult> {
  // Pull fresh availability from Airbnb & co. before deciding (bounded, never blocks the booking).
  await refreshPropertyFeedsIfStale(input.propertyId);
  const settings = await loadSettings();

  return bookingTransaction(async (tx) => {
    await lockProperty(tx, input.propertyId);
    const property = await loadPropertyForBooking(tx, input.propertyId);
    if (property.status !== "PUBLISHED") throw new ActionError("NOT_FOUND");

    const bank = resolveBankDetails(property.owner, settings);
    if (!bank) throw new ActionError("INVALID_STATE", { reason: "NO_BANK_ACCOUNT" });

    await expireStaleHolds(tx, property.id);

    const config = toPricingConfig(property, property.seasons, property.priceRules);
    const result = calculateQuote(
      { checkIn: input.checkIn, checkOut: input.checkOut, guests: input.guests, today: todayISO() },
      config,
    );
    if (!result.ok) quoteError(result);
    const quote = result.quote;

    await assertAvailable(tx, property.id, input.checkIn, input.checkOut);

    if (quote.total !== input.expectedTotal) {
      throw new ActionError("PRICE_CHANGED", { quote: quote as unknown as Record<string, unknown> });
    }

    const guest = await upsertGuest(tx, input.guest);
    const holdExpiresAt = holdDeadline(settings);
    const reservation = await tx.reservation.create({
      data: {
        code: await generateReservationCode(tx),
        propertyId: property.id,
        guestId: guest.id,
        status: "AWAITING_PAYMENT",
        source: "DIRECT",
        checkIn: toDbDate(input.checkIn),
        checkOut: toDbDate(input.checkOut),
        guestCount: input.guests,
        comments: input.comments,
        locale: input.locale,
        currency: quote.currency,
        holdExpiresAt,
        ...quoteColumns(quote),
        payments: {
          create: {
            currency: quote.currency,
            amountDue: centsToDecimalString(quote.total),
            bankSnapshot: bank as unknown as Prisma.InputJsonValue,
          },
        },
      },
      include: { guest: true, property: { select: { title: true, checkInTime: true, checkOutTime: true } } },
    });

    await audit(tx, actor, "reservation.created", { type: "Reservation", id: reservation.id }, {
      code: reservation.code,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      total: quote.total,
    });

    const payload = reservationPayload(reservation, { bank, deadline: holdExpiresAt.toISOString() });
    const notificationIds = [
      await queueGuestNotification(tx, "RESERVATION_REQUESTED", { reservationId: reservation.id, email: guest.email, locale: reservation.locale }, payload),
      ...(await queueStaffAlert(tx, "ADMIN_NEW_RESERVATION", payload, reservation.id)),
    ];

    return { id: reservation.id, code: reservation.code, accessVersion: reservation.accessVersion, locale: reservation.locale, notificationIds };
  });
}

// ─── Staff operations ─────────────────────────────────────────────────────────

export interface ManualBookingInput {
  propertyId: string;
  checkIn: ISODate;
  checkOut: ISODate;
  guests: number;
  guest: GuestInput;
  status: Extract<ReservationStatus, "PENDING" | "AWAITING_PAYMENT" | "CONFIRMED">;
  /** Overrides the computed total (cents), e.g. a negotiated price. */
  totalOverride: number | null;
  adminNotes: string | null;
  locale: string;
  notifyGuest: boolean;
}

/** Staff can record stays outside the public rules (past dates, shorter stays) but never overlapping ones. */
function staffPricingConfig(config: PricingConfig): PricingConfig {
  return {
    ...config,
    property: { ...config.property, minNights: 1, maxNights: null },
    seasons: config.seasons.map((season) => ({ ...season, minNights: null })),
  };
}

export async function createManualReservation(input: ManualBookingInput, actor: AuditActor & { id: string }): Promise<BookingResult> {
  const settings = await loadSettings();
  return bookingTransaction(async (tx) => {
    await lockProperty(tx, input.propertyId);
    const property = await loadPropertyForBooking(tx, input.propertyId);
    await expireStaleHolds(tx, property.id);

    const result = calculateQuote(
      { checkIn: input.checkIn, checkOut: input.checkOut, guests: input.guests, today: input.checkIn },
      staffPricingConfig(toPricingConfig(property, property.seasons, property.priceRules)),
    );
    if (!result.ok) quoteError(result);
    const quote: Quote = input.totalOverride === null ? result.quote : { ...result.quote, total: input.totalOverride };

    await assertAvailable(tx, property.id, input.checkIn, input.checkOut);

    const bank = resolveBankDetails(property.owner, settings);
    const guest = await upsertGuest(tx, input.guest);
    const confirmed = input.status === "CONFIRMED";
    const holdExpiresAt = input.status === "AWAITING_PAYMENT" ? holdDeadline(settings) : null;
    const reservation = await tx.reservation.create({
      data: {
        code: await generateReservationCode(tx),
        propertyId: property.id,
        guestId: guest.id,
        status: input.status,
        source: "MANUAL",
        checkIn: toDbDate(input.checkIn),
        checkOut: toDbDate(input.checkOut),
        guestCount: input.guests,
        locale: input.locale,
        currency: quote.currency,
        holdExpiresAt,
        adminNotes: input.adminNotes,
        createdById: actor.id,
        confirmedAt: confirmed ? new Date() : null,
        ...quoteColumns(quote),
        payments: {
          create: {
            currency: quote.currency,
            amountDue: centsToDecimalString(quote.total),
            bankSnapshot: (bank ?? {}) as unknown as Prisma.InputJsonValue,
            status: confirmed ? "VERIFIED" : "PENDING",
            amountReceived: confirmed ? centsToDecimalString(quote.total) : null,
            verifiedAt: confirmed ? new Date() : null,
            verifiedById: confirmed ? actor.id : null,
          },
        },
      },
      include: { guest: true, property: { select: { title: true, checkInTime: true, checkOutTime: true, address: true, arrivalInstructions: true } } },
    });

    await audit(tx, actor, "reservation.created_manual", { type: "Reservation", id: reservation.id }, {
      code: reservation.code,
      status: input.status,
      total: quote.total,
    });

    const notificationIds: string[] = [];
    if (input.notifyGuest) {
      const template = confirmed ? "RESERVATION_CONFIRMED" : "RESERVATION_REQUESTED";
      const extra = confirmed
        ? { address: reservation.property.address, arrival: reservation.property.arrivalInstructions }
        : { bank: bank ?? undefined, deadline: holdExpiresAt?.toISOString() ?? null };
      notificationIds.push(
        await queueGuestNotification(tx, template, { reservationId: reservation.id, email: guest.email, locale: reservation.locale }, reservationPayload(reservation, extra)),
      );
    }
    return { id: reservation.id, code: reservation.code, accessVersion: reservation.accessVersion, locale: reservation.locale, notificationIds };
  });
}

const reservationInclude = {
  guest: true,
  property: { select: { id: true, title: true, checkInTime: true, checkOutTime: true, address: true, arrivalInstructions: true } },
  payments: { include: { proofs: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.ReservationInclude;

async function loadReservation(tx: Tx, id: string) {
  const reservation = await tx.reservation.findUnique({ where: { id }, include: reservationInclude });
  if (!reservation) throw new ActionError("NOT_FOUND");
  return reservation;
}

function assertStatus(status: ReservationStatus, allowed: readonly ReservationStatus[]) {
  if (!allowed.includes(status)) throw new ActionError("INVALID_STATE", { status });
}

/**
 * Confirms a reservation after payment verification. Re-checks, under the property lock, that no
 * external event or manual block appeared on these dates while the reservation was pending.
 */
export async function confirmReservation(
  reservationId: string,
  actor: AuditActor & { id: string },
  options: { amountReceived: number | null; proofId?: string; note?: string | null },
): Promise<string[]> {
  const outcome = await bookingTransaction(async (tx) => {
    const current = await tx.reservation.findUnique({ where: { id: reservationId }, select: { propertyId: true } });
    if (!current) throw new ActionError("NOT_FOUND");
    await lockProperty(tx, current.propertyId);
    const reservation = await loadReservation(tx, reservationId);
    assertStatus(reservation.status, ["PENDING", "AWAITING_PAYMENT", "PROOF_RECEIVED", "UNDER_REVIEW"]);

    const checkIn = fromDbDate(reservation.checkIn);
    const checkOut = fromDbDate(reservation.checkOut);
    const ranges = await loadPropertyRanges(tx, reservation.propertyId, checkIn, checkOut, { excludeReservationId: reservation.id });
    const conflicts = findConflicts(ranges, checkIn, checkOut);
    if (conflicts.length > 0) {
      // Returned (not thrown) so the flag below is persisted instead of rolled back.
      return { conflicts: conflicts.map(({ kind, start, end }) => ({ kind, start, end })) };
    }

    const now = new Date();
    await tx.reservation.update({
      where: { id: reservation.id },
      data: { status: "CONFIRMED", confirmedAt: now, holdExpiresAt: null, hasConflict: false },
    });
    const payment = reservation.payments[0];
    if (payment) {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "VERIFIED",
          verifiedAt: now,
          verifiedById: actor.id,
          amountReceived: centsToDecimalString(options.amountReceived ?? toCents(payment.amountDue)),
        },
      });
      await tx.paymentProof.updateMany({
        where: { paymentId: payment.id, status: "PENDING_REVIEW", ...(options.proofId ? { id: options.proofId } : {}) },
        data: { status: "APPROVED", reviewedAt: now, reviewedById: actor.id, reviewNote: options.note ?? null },
      });
    }

    await audit(tx, actor, "reservation.confirmed", { type: "Reservation", id: reservation.id }, {
      amountReceived: options.amountReceived,
      proofId: options.proofId ?? null,
    });
    return {
      notificationIds: [
        await queueGuestNotification(
          tx,
          "RESERVATION_CONFIRMED",
          { reservationId: reservation.id, email: reservation.guest.email, locale: reservation.locale },
          reservationPayload(reservation, { address: reservation.property.address, arrival: reservation.property.arrivalInstructions }),
        ),
      ],
    };
  });

  if ("conflicts" in outcome) {
    await prisma.reservation.update({ where: { id: reservationId }, data: { hasConflict: true } });
    throw new ActionError("CALENDAR_CONFLICT", { conflicts: outcome.conflicts });
  }
  return outcome.notificationIds;
}

export type ProofDecision = "APPROVE" | "REJECT" | "REQUEST_NEW";

export async function reviewProof(
  proofId: string,
  decision: ProofDecision,
  actor: AuditActor & { id: string },
  options: { note: string | null; amountReceived: number | null },
): Promise<string[]> {
  const proof = await prisma.paymentProof.findUnique({ where: { id: proofId }, include: { payment: true } });
  if (!proof) throw new ActionError("NOT_FOUND");
  if (proof.status !== "PENDING_REVIEW") throw new ActionError("INVALID_STATE", { status: proof.status });

  if (decision === "APPROVE") {
    return confirmReservation(proof.payment.reservationId, actor, { amountReceived: options.amountReceived, proofId, note: options.note });
  }

  const settings = await loadSettings();
  return prisma.$transaction(async (tx) => {
    const reservation = await loadReservation(tx, proof.payment.reservationId);
    assertStatus(reservation.status, ["PENDING", "AWAITING_PAYMENT", "PROOF_RECEIVED", "UNDER_REVIEW"]);
    const now = new Date();
    const claimed = await tx.paymentProof.updateMany({
      where: { id: proofId, status: "PENDING_REVIEW" },
      data: {
        status: decision === "REJECT" ? "REJECTED" : "RESUBMISSION_REQUESTED",
        reviewNote: options.note,
        reviewedAt: now,
        reviewedById: actor.id,
      },
    });
    if (claimed.count === 0) throw new ActionError("INVALID_STATE");

    const stillPending = await tx.paymentProof.count({ where: { paymentId: proof.paymentId, status: "PENDING_REVIEW" } });
    let holdExpiresAt: Date | null = reservation.holdExpiresAt;
    if (stillPending === 0) {
      // Back to "waiting for payment" with a fresh window to send a valid receipt.
      holdExpiresAt = holdDeadline(settings);
      await tx.reservation.update({ where: { id: reservation.id }, data: { status: "AWAITING_PAYMENT", holdExpiresAt } });
    }

    await audit(tx, actor, decision === "REJECT" ? "proof.rejected" : "proof.resubmission_requested", { type: "PaymentProof", id: proofId }, {
      reservationId: reservation.id,
      note: options.note,
    });
    const bank = proof.payment.bankSnapshot as unknown as BankDetails;
    return [
      await queueGuestNotification(
        tx,
        "PROOF_REJECTED",
        { reservationId: reservation.id, email: reservation.guest.email, locale: reservation.locale },
        reservationPayload(reservation, { note: options.note, bank, deadline: holdExpiresAt?.toISOString() ?? null }),
      ),
    ];
  });
}

export async function markUnderReview(reservationId: string, actor: AuditActor & { id: string }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.reservation.updateMany({
      where: { id: reservationId, status: "PROOF_RECEIVED" },
      data: { status: "UNDER_REVIEW" },
    });
    if (updated.count === 0) throw new ActionError("INVALID_STATE");
    await audit(tx, actor, "reservation.under_review", { type: "Reservation", id: reservationId });
  });
}

/** Final negative decision on a request (dates are released). */
export async function rejectReservation(reservationId: string, actor: AuditActor & { id: string }, reason: string | null): Promise<string[]> {
  return closeReservation(reservationId, actor, reason, "REJECTED");
}

export async function cancelReservation(
  reservationId: string,
  actor: AuditActor & { id: string },
  reason: string | null,
  notifyGuest: boolean,
): Promise<string[]> {
  return closeReservation(reservationId, actor, reason, "CANCELLED", notifyGuest);
}

async function closeReservation(
  reservationId: string,
  actor: AuditActor & { id: string },
  reason: string | null,
  status: "REJECTED" | "CANCELLED",
  notifyGuest = true,
): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    const reservation = await loadReservation(tx, reservationId);
    const allowed: readonly ReservationStatus[] =
      status === "REJECTED" ? ["PENDING", "AWAITING_PAYMENT", "PROOF_RECEIVED", "UNDER_REVIEW"] : OPEN_STATUSES;
    assertStatus(reservation.status, allowed);
    const now = new Date();
    await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        status,
        holdExpiresAt: null,
        hasConflict: false,
        cancelReason: reason,
        cancelledAt: now,
      },
    });
    for (const payment of reservation.payments) {
      if (payment.status === "PENDING") await tx.payment.update({ where: { id: payment.id }, data: { status: "REJECTED" } });
      await tx.paymentProof.updateMany({
        where: { paymentId: payment.id, status: "PENDING_REVIEW" },
        data: { status: "REJECTED", reviewedAt: now, reviewedById: actor.id, reviewNote: reason },
      });
    }
    await audit(tx, actor, status === "REJECTED" ? "reservation.rejected" : "reservation.cancelled", { type: "Reservation", id: reservation.id }, {
      reason,
      previousStatus: reservation.status,
    });
    if (!notifyGuest) return [];
    return [
      await queueGuestNotification(
        tx,
        status === "REJECTED" ? "RESERVATION_REJECTED" : "RESERVATION_CANCELLED",
        { reservationId: reservation.id, email: reservation.guest.email, locale: reservation.locale },
        reservationPayload(reservation, { note: reason }),
      ),
    ];
  });
}

export interface ChangeDatesInput {
  checkIn: ISODate;
  checkOut: ISODate;
  guests: number;
  pricing: "KEEP" | "RECALCULATE";
  notifyGuest: boolean;
}

export async function changeReservationDates(
  reservationId: string,
  input: ChangeDatesInput,
  actor: AuditActor & { id: string },
): Promise<string[]> {
  return bookingTransaction(async (tx) => {
    const current = await tx.reservation.findUnique({ where: { id: reservationId }, select: { propertyId: true } });
    if (!current) throw new ActionError("NOT_FOUND");
    await lockProperty(tx, current.propertyId);
    const reservation = await loadReservation(tx, reservationId);
    assertStatus(reservation.status, OPEN_STATUSES);
    const property = await loadPropertyForBooking(tx, reservation.propertyId);

    const result = calculateQuote(
      { checkIn: input.checkIn, checkOut: input.checkOut, guests: input.guests, today: input.checkIn },
      staffPricingConfig(toPricingConfig(property, property.seasons, property.priceRules)),
    );
    if (!result.ok) quoteError(result);

    await assertAvailable(tx, reservation.propertyId, input.checkIn, input.checkOut, reservation.id);

    const pricing =
      input.pricing === "RECALCULATE"
        ? quoteColumns(result.quote)
        : { nights: result.quote.nights };
    const updated = await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        checkIn: toDbDate(input.checkIn),
        checkOut: toDbDate(input.checkOut),
        guestCount: input.guests,
        hasConflict: false,
        ...pricing,
      },
      include: reservationInclude,
    });
    if (input.pricing === "RECALCULATE") {
      await tx.payment.updateMany({
        where: { reservationId: reservation.id, status: "PENDING" },
        data: { amountDue: centsToDecimalString(result.quote.total) },
      });
    }
    await audit(tx, actor, "reservation.dates_changed", { type: "Reservation", id: reservation.id }, {
      from: { checkIn: fromDbDate(reservation.checkIn), checkOut: fromDbDate(reservation.checkOut), guests: reservation.guestCount },
      to: { checkIn: input.checkIn, checkOut: input.checkOut, guests: input.guests },
      pricing: input.pricing,
    });
    if (!input.notifyGuest) return [];
    return [
      await queueGuestNotification(
        tx,
        "DATES_CHANGED",
        { reservationId: updated.id, email: updated.guest.email, locale: updated.locale },
        reservationPayload(updated),
      ),
    ];
  });
}

// ─── Scheduled transitions (cron) ─────────────────────────────────────────────

/** Confirmed stays whose check-out day has arrived become COMPLETED and get a thank-you email. */
export async function completeFinishedStays(): Promise<number> {
  const today = toDbDate(todayISO());
  const finished = await prisma.reservation.findMany({
    where: { status: "CONFIRMED", checkOut: { lte: today } },
    include: reservationInclude,
    take: 200,
  });
  for (const reservation of finished) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.reservation.updateMany({
        where: { id: reservation.id, status: "CONFIRMED" },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      if (updated.count === 0) return;
      await queueGuestNotification(
        tx,
        "POST_STAY",
        { reservationId: reservation.id, email: reservation.guest.email, locale: reservation.locale },
        reservationPayload(reservation),
      );
    });
  }
  return finished.length;
}

/** "Your stay starts soon" N days before check-in, sent once per reservation. */
export async function sendCheckInReminders(): Promise<number> {
  const settings = await loadSettings();
  const today = todayISO();
  const upcoming = await prisma.reservation.findMany({
    where: {
      status: "CONFIRMED",
      checkIn: { gte: toDbDate(today), lte: toDbDate(addDays(today, settings.booking.reminderDaysBefore)) },
      notifications: { none: { template: "CHECKIN_REMINDER" } },
    },
    include: reservationInclude,
    take: 200,
  });
  for (const reservation of upcoming) {
    await queueGuestNotification(
      prisma,
      "CHECKIN_REMINDER",
      { reservationId: reservation.id, email: reservation.guest.email, locale: reservation.locale },
      reservationPayload(reservation, { address: reservation.property.address, arrival: reservation.property.arrivalInstructions }),
    );
  }
  return upcoming.length;
}

export async function expireAllStaleHolds(): Promise<number> {
  const propertyIds = await prisma.reservation.findMany({
    where: { status: { in: [...EXPIRING_STATUSES] }, holdExpiresAt: { lt: new Date() } },
    select: { propertyId: true },
    distinct: ["propertyId"],
  });
  let expired = 0;
  for (const { propertyId } of propertyIds) {
    expired += await prisma.$transaction(async (tx) => {
      await lockProperty(tx, propertyId);
      return expireStaleHolds(tx, propertyId);
    });
  }
  return expired;
}

