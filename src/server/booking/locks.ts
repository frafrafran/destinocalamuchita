import "server-only";
import { EXPIRING_STATUSES } from "@/lib/reservation-status";
import { ActionError } from "../action-result";
import type { Tx } from "../db";
import { queueGuestNotification } from "../notifications";
import { reservationPayload } from "./payload";

/**
 * Serialises every availability-changing write for one property: reservations, confirmations,
 * date changes, manual blocks and iCal imports all take this row lock first, so the checks they
 * run across Reservation / Availability / CalendarEvent see a consistent picture.
 * Concurrent requests for the same property wait; different properties never contend.
 */
export async function lockProperty(tx: Tx, propertyId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Property" WHERE "id" = ${propertyId} FOR UPDATE`;
  if (rows.length === 0) throw new ActionError("NOT_FOUND");
}

/**
 * Expires holds whose deadline passed (guest never sent the receipt) and notifies the guest.
 * Runs inside booking transactions, so correctness never depends on the cron schedule.
 */
export async function expireStaleHolds(tx: Tx, propertyId?: string): Promise<number> {
  const now = new Date();
  const stale = await tx.reservation.findMany({
    where: {
      status: { in: [...EXPIRING_STATUSES] },
      holdExpiresAt: { lt: now },
      ...(propertyId ? { propertyId } : {}),
    },
    include: { guest: true, property: { select: { title: true, checkInTime: true, checkOutTime: true } } },
  });
  for (const reservation of stale) {
    const updated = await tx.reservation.updateMany({
      where: { id: reservation.id, status: reservation.status },
      data: { status: "EXPIRED", holdExpiresAt: null },
    });
    if (updated.count === 0) continue;
    await tx.payment.updateMany({ where: { reservationId: reservation.id, status: "PENDING" }, data: { status: "REJECTED" } });
    await tx.auditLog.create({
      data: { actorType: "SYSTEM", action: "reservation.expired", entityType: "Reservation", entityId: reservation.id },
    });
    await queueGuestNotification(
      tx,
      "RESERVATION_EXPIRED",
      { reservationId: reservation.id, email: reservation.guest.email, locale: reservation.locale },
      reservationPayload(reservation),
    );
  }
  return stale.length;
}
