"use server";

import { after } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { isValidISODate } from "@/lib/dates";
import { type ActionResult, ActionError, parseInput, runAction } from "@/server/action-result";
import { guestAccessToken, setGuestAccessCookie } from "@/server/booking/guest-access";
import { reservationPayload } from "@/server/booking/payload";
import { createDirectReservation } from "@/server/booking/reservations";
import { prisma } from "@/server/db";
import { dispatchNotifications, queueGuestNotification } from "@/server/notifications";
import { consumeRateLimit } from "@/server/rate-limit";
import { getClientIp } from "@/server/request";

const isoDate = z.string().refine(isValidISODate);
const phone = z.string().trim().regex(/^\+?[\d\s().-]{7,24}$/, { error: "phone" });

const bookingSchema = z.object({
  slug: z.string().min(1).max(120),
  checkIn: isoDate,
  checkOut: isoDate,
  guests: z.number().int().min(1).max(50),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.email().trim().toLowerCase().max(120),
  phone,
  country: z.string().trim().max(60).optional(),
  comments: z.string().trim().max(1000).optional(),
  expectedTotal: z.number().int().min(0),
  acceptTerms: z.literal(true),
  /** Honeypot: humans never see this field. */
  website: z.string().max(0).optional(),
});

export type BookingInput = z.input<typeof bookingSchema>;

export async function createReservationAction(input: BookingInput): Promise<ActionResult<{ code: string }>> {
  return runAction(async () => {
    const t = await getTranslations("validation");
    const locale = await getLocale();
    const data = parseInput(bookingSchema, input, t);
    const ip = await getClientIp();

    const limit = await consumeRateLimit(`book:${ip}`, 10, 3600);
    if (!limit.allowed) throw new ActionError("RATE_LIMITED");

    const property = await prisma.property.findUnique({ where: { slug: data.slug }, select: { id: true } });
    if (!property) throw new ActionError("NOT_FOUND");

    const result = await createDirectReservation(
      {
        propertyId: property.id,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        guests: data.guests,
        guest: { firstName: data.firstName, lastName: data.lastName, email: data.email, phone: data.phone, country: data.country || null },
        comments: data.comments || null,
        locale,
        expectedTotal: data.expectedTotal,
      },
      { type: "GUEST", ip },
    );

    await setGuestAccessCookie(result.code, guestAccessToken(result));
    after(() => dispatchNotifications(result.notificationIds));
    return { code: result.code };
  });
}

const lookupSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(RMS-)?[A-Z0-9]{6}$/)
    .transform((value) => (value.startsWith("RMS-") ? value : `RMS-${value}`)),
  email: z.email().trim().toLowerCase().max(120),
});

/**
 * "Where is my booking?": emails a fresh access link when code and email match.
 * The response is identical either way so it cannot be used to discover bookings.
 */
export async function requestAccessLinkAction(input: z.input<typeof lookupSchema>): Promise<ActionResult<{ sent: true }>> {
  return runAction(async () => {
    const t = await getTranslations("validation");
    const data = parseInput(lookupSchema, input, t);
    const ip = await getClientIp();
    const limit = await consumeRateLimit(`lookup:${ip}`, 6, 900);
    if (!limit.allowed) throw new ActionError("RATE_LIMITED");

    const reservation = await prisma.reservation.findFirst({
      where: { code: data.code, guest: { email: data.email } },
      include: { guest: true, property: { select: { title: true, checkInTime: true, checkOutTime: true } } },
    });
    if (reservation) {
      const id = await queueGuestNotification(
        prisma,
        "ACCESS_LINK",
        { reservationId: reservation.id, email: reservation.guest.email, locale: reservation.locale },
        reservationPayload(reservation),
      );
      after(() => dispatchNotifications([id]));
    }
    return { sent: true };
  });
}
