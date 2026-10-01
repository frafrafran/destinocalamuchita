import "server-only";
import type { Guest, Reservation } from "@/generated/prisma/client";
import { fromDbDate } from "@/lib/dates";
import { toCents } from "@/lib/money";
import type { NotificationPayload } from "../notifications/templates";
import { guestAccessUrl } from "./guest-access";

type PayloadReservation = Pick<
  Reservation,
  "id" | "code" | "checkIn" | "checkOut" | "nights" | "guestCount" | "total" | "currency" | "locale" | "accessVersion"
> & {
  guest: Pick<Guest, "firstName" | "lastName">;
  property: { title: string; checkInTime: string; checkOutTime: string };
};

/** Common fields every reservation email/alert needs, snapshotted into the notification row. */
export function reservationPayload(reservation: PayloadReservation, extra: NotificationPayload = {}): NotificationPayload {
  return {
    code: reservation.code,
    reservationId: reservation.id,
    propertyTitle: reservation.property.title,
    checkIn: fromDbDate(reservation.checkIn),
    checkOut: fromDbDate(reservation.checkOut),
    checkInTime: reservation.property.checkInTime,
    checkOutTime: reservation.property.checkOutTime,
    nights: reservation.nights,
    guests: reservation.guestCount,
    total: toCents(reservation.total),
    currency: reservation.currency,
    guestName: `${reservation.guest.firstName} ${reservation.guest.lastName}`,
    link: guestAccessUrl(reservation),
    ...extra,
  };
}
