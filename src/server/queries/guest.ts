import "server-only";
import type { Locale } from "@/i18n/config";
import { fromDbDate } from "@/lib/dates";
import { toCents } from "@/lib/money";
import type { Quote } from "@/lib/pricing";
import { isValidGuestToken, readGuestAccessCookie } from "../booking/guest-access";
import { prisma } from "../db";
import type { BankDetails } from "../notifications/templates";

/** The guest's view of a reservation, or null when the visitor has no valid access cookie. */
export async function getGuestReservation(code: string, locale: Locale) {
  const normalized = code.toUpperCase();
  if (!/^RMS-[A-Z0-9]{6}$/.test(normalized)) return { status: "not-found" as const };

  const reservation = await prisma.reservation.findUnique({
    where: { code: normalized },
    include: {
      guest: true,
      property: {
        include: {
          images: { orderBy: { position: "asc" }, take: 1 },
          translations: { where: { locale } },
        },
      },
      payments: { orderBy: { createdAt: "asc" }, include: { proofs: { orderBy: { uploadedAt: "asc" } } } },
    },
  });
  if (!reservation) return { status: "not-found" as const };

  const token = await readGuestAccessCookie(reservation.code);
  if (!isValidGuestToken(reservation, token)) return { status: "locked" as const, code: reservation.code };

  const translation = reservation.property.translations[0];
  const confirmed = reservation.status === "CONFIRMED" || reservation.status === "COMPLETED";
  const payment = reservation.payments[0] ?? null;

  return {
    status: "ok" as const,
    reservation: {
      id: reservation.id,
      code: reservation.code,
      status: reservation.status,
      checkIn: fromDbDate(reservation.checkIn),
      checkOut: fromDbDate(reservation.checkOut),
      nights: reservation.nights,
      guestCount: reservation.guestCount,
      currency: reservation.currency,
      total: toCents(reservation.total),
      quote: reservation.priceBreakdown as unknown as Quote,
      holdExpiresAt: reservation.holdExpiresAt?.toISOString() ?? null,
      createdAt: reservation.createdAt.toISOString(),
      cancelReason: reservation.cancelReason,
      guest: { firstName: reservation.guest.firstName, lastName: reservation.guest.lastName, email: reservation.guest.email },
      property: {
        slug: reservation.property.slug,
        title: translation?.title || reservation.property.title,
        city: reservation.property.city,
        image: reservation.property.images[0] ?? null,
        checkInTime: reservation.property.checkInTime,
        checkOutTime: reservation.property.checkOutTime,
        cancellationPolicy: translation?.cancellationPolicy || reservation.property.cancellationPolicy,
        // Exact address and arrival details are only revealed once the stay is confirmed.
        address: confirmed ? reservation.property.address : null,
        arrivalInstructions: confirmed ? translation?.arrivalInstructions || reservation.property.arrivalInstructions : null,
        latitude: confirmed && reservation.property.latitude !== null ? Number(reservation.property.latitude) : null,
        longitude: confirmed && reservation.property.longitude !== null ? Number(reservation.property.longitude) : null,
      },
      payment: payment
        ? {
            status: payment.status,
            amountDue: toCents(payment.amountDue),
            bank: payment.bankSnapshot as unknown as BankDetails,
            proofs: payment.proofs.map((proof) => ({
              id: proof.id,
              fileName: proof.fileName,
              status: proof.status,
              uploadedAt: proof.uploadedAt.toISOString(),
              reviewNote: proof.status === "APPROVED" ? null : proof.reviewNote,
            })),
          }
        : null,
    },
  };
}

export type GuestReservation = Extract<Awaited<ReturnType<typeof getGuestReservation>>, { status: "ok" }>["reservation"];
