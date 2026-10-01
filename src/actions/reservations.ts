"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { isValidISODate } from "@/lib/dates";
import { parseMoneyInput } from "@/lib/money";
import { type ActionResult, ActionError, parseInput, runAction } from "@/server/action-result";
import { audit } from "@/server/audit";
import { requireActionUser } from "@/server/auth/guard";
import { reservationPayload } from "@/server/booking/payload";
import {
  type ProofDecision,
  cancelReservation,
  changeReservationDates,
  confirmReservation,
  createManualReservation,
  markUnderReview,
  rejectReservation,
  reviewProof,
} from "@/server/booking/reservations";
import { prisma } from "@/server/db";
import { dispatchNotifications, queueGuestNotification } from "@/server/notifications";
import { getClientIp } from "@/server/request";

const isoDate = z.string().refine(isValidISODate);
const note = z.string().trim().max(1000).optional().transform((value) => value || null);
const moneyInput = z
  .string()
  .trim()
  .max(20)
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    try {
      return parseMoneyInput(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "invalid" });
      return z.NEVER;
    }
  });

async function actor(permission: Parameters<typeof requireActionUser>[0]) {
  const user = await requireActionUser(permission);
  return { user, actor: { type: "USER" as const, id: user.id, ip: await getClientIp() } };
}

/** Sends queued emails after the response and refreshes the admin views (all dynamic). */
function done(ids: string[]) {
  if (ids.length) after(() => dispatchNotifications(ids));
  refresh();
}

export async function confirmReservationAction(reservationId: string, input: { amountReceived?: string; note?: string }): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { actor: who } = await actor("payments:review");
    const t = await getTranslations("validation");
    const data = parseInput(z.object({ amountReceived: moneyInput, note }), input, t);
    const ids = await confirmReservation(reservationId, who, { amountReceived: data.amountReceived, note: data.note });
    done(ids);
    return undefined;
  });
}

export async function reviewProofAction(
  proofId: string,
  decision: ProofDecision,
  input: { amountReceived?: string; note?: string },
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { actor: who } = await actor("payments:review");
    const t = await getTranslations("validation");
    const data = parseInput(z.object({ amountReceived: moneyInput, note }), input, t);
    if (decision !== "APPROVE" && !data.note) throw new ActionError("VALIDATION", undefined, { note: t("required") });
    const proof = await prisma.paymentProof.findUnique({ where: { id: proofId }, select: { payment: { select: { reservationId: true } } } });
    if (!proof) throw new ActionError("NOT_FOUND");
    const ids = await reviewProof(proofId, decision, who, data);
    done(ids);
    return undefined;
  });
}

export async function markUnderReviewAction(reservationId: string): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { actor: who } = await actor("payments:review");
    await markUnderReview(reservationId, who);
    done([]);
    return undefined;
  });
}

export async function closeReservationAction(
  reservationId: string,
  kind: "reject" | "cancel",
  input: { reason?: string; notifyGuest?: boolean },
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { actor: who } = await actor("reservations:write");
    const t = await getTranslations("validation");
    const data = parseInput(z.object({ reason: note, notifyGuest: z.boolean().default(true) }), input, t);
    const ids =
      kind === "reject"
        ? await rejectReservation(reservationId, who, data.reason)
        : await cancelReservation(reservationId, who, data.reason, data.notifyGuest);
    done(ids);
    return undefined;
  });
}

const changeDatesSchema = z
  .object({
    checkIn: isoDate,
    checkOut: isoDate,
    guests: z.coerce.number().int().min(1).max(50),
    pricing: z.enum(["KEEP", "RECALCULATE"]),
    notifyGuest: z.boolean(),
  })
  .refine((value) => value.checkOut > value.checkIn, { path: ["checkOut"], message: "dateOrder" });

export async function changeDatesAction(reservationId: string, input: z.input<typeof changeDatesSchema>): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { actor: who } = await actor("reservations:write");
    const t = await getTranslations("validation");
    const data = parseInput(changeDatesSchema, input, t);
    const ids = await changeReservationDates(reservationId, data, who);
    done(ids);
    return undefined;
  });
}

export async function updateAdminNotesAction(reservationId: string, notes: string): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { actor: who } = await actor("reservations:write");
    const value = notes.trim().slice(0, 5000) || null;
    await prisma.reservation.update({ where: { id: reservationId }, data: { adminNotes: value } });
    await audit(prisma, who, "reservation.notes_updated", { type: "Reservation", id: reservationId });
    done([]);
    return undefined;
  });
}

/** Re-sends the guest's access link; `revoke` first invalidates every link sent so far. */
export async function sendGuestLinkAction(reservationId: string, revoke: boolean): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { actor: who } = await actor("reservations:write");
    const reservation = await prisma.reservation.update({
      where: { id: reservationId },
      data: revoke ? { accessVersion: { increment: 1 } } : {},
      include: { guest: true, property: { select: { title: true, checkInTime: true, checkOutTime: true } } },
    });
    const id = await queueGuestNotification(
      prisma,
      "ACCESS_LINK",
      { reservationId, email: reservation.guest.email, locale: reservation.locale },
      reservationPayload(reservation),
    );
    await audit(prisma, who, revoke ? "reservation.links_revoked" : "reservation.link_sent", { type: "Reservation", id: reservationId });
    done([id]);
    return undefined;
  });
}

const manualSchema = z
  .object({
    propertyId: z.string().min(1),
    checkIn: isoDate,
    checkOut: isoDate,
    guests: z.coerce.number().int().min(1).max(50),
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    email: z.email().trim().toLowerCase().max(120),
    phone: z.string().trim().regex(/^\+?[\d\s().-]{7,24}$/, { error: "phone" }),
    status: z.enum(["PENDING", "AWAITING_PAYMENT", "CONFIRMED"]),
    totalOverride: moneyInput,
    adminNotes: note,
    locale: z.enum(["es", "en", "pt"]),
    notifyGuest: z.boolean(),
  })
  .refine((value) => value.checkOut > value.checkIn, { path: ["checkOut"], message: "dateOrder" });

export async function createManualReservationAction(input: z.input<typeof manualSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { actor: who } = await actor("reservations:write");
    const t = await getTranslations("validation");
    const data = parseInput(manualSchema, input, t);
    const result = await createManualReservation(
      {
        propertyId: data.propertyId,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        guests: data.guests,
        guest: { firstName: data.firstName, lastName: data.lastName, email: data.email, phone: data.phone },
        status: data.status,
        totalOverride: data.totalOverride,
        adminNotes: data.adminNotes,
        locale: data.locale ?? (await getLocale()),
        notifyGuest: data.notifyGuest,
      },
      who,
    );
    done(result.notificationIds);
    return { id: result.id };
  });
}
