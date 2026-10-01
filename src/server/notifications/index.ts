import "server-only";
import type { NotificationChannel, Prisma } from "@/generated/prisma/client";
import { type Db, prisma } from "../db";
import { absoluteUrl } from "../env";
import { loadSettings } from "../settings";
import { type ChannelSender, emailSender } from "./email";
import { type GuestTemplate, type NotificationPayload, type StaffTemplate, renderNotification } from "./templates";

export type { NotificationPayload } from "./templates";

/**
 * Outbox pattern: notifications are inserted inside the same transaction as the state change that
 * causes them, then delivered after commit (`dispatchNotifications`). A failed delivery never
 * rolls back a reservation, and the cron job retries failures.
 *
 * Channels: EMAIL is implemented. WHATSAPP and SMS plug in by adding a sender to `SENDERS`
 * (e.g. Twilio / Meta Cloud API) and queueing rows with that channel.
 */
const SENDERS: Partial<Record<NotificationChannel, () => ChannelSender>> = {
  EMAIL: emailSender,
};

const MAX_ATTEMPTS = 5;

export async function queueGuestNotification(
  db: Db,
  template: GuestTemplate,
  target: { reservationId: string; email: string; locale: string },
  payload: NotificationPayload,
): Promise<string> {
  const row = await db.notification.create({
    data: {
      channel: "EMAIL",
      template,
      recipient: target.email,
      reservationId: target.reservationId,
      locale: target.locale,
      payload: payload as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * Alerts the agency: an in-app notification for every active admin/manager plus an email to the
 * addresses configured in Settings → Notifications (falls back to admin users' emails).
 */
export async function queueStaffAlert(
  db: Db,
  template: StaffTemplate,
  payload: NotificationPayload,
  reservationId?: string,
): Promise<string[]> {
  // Sequential: `db` is usually the booking transaction.
  const staff = await db.user.findMany({ where: { isActive: true, role: { in: ["ADMIN", "MANAGER"] } }, select: { id: true, email: true, role: true } });
  const settings = await loadSettings(db);
  const link = reservationId ? absoluteUrl(`/admin/reservas/${reservationId}`) : absoluteUrl("/admin");
  const fullPayload = { ...payload, link } as unknown as Prisma.InputJsonValue;

  await db.notification.createMany({
    data: staff.map((user) => ({
      channel: "IN_APP" as const,
      template,
      userId: user.id,
      reservationId: reservationId ?? null,
      payload: fullPayload,
      status: "SENT" as const,
      sentAt: new Date(),
    })),
  });

  const recipients = settings.notifications.adminEmails.length
    ? settings.notifications.adminEmails
    : staff.filter((user) => user.role === "ADMIN").map((user) => user.email);

  const ids: string[] = [];
  for (const email of recipients) {
    const row = await db.notification.create({
      data: { channel: "EMAIL", template, recipient: email, reservationId: reservationId ?? null, payload: fullPayload },
      select: { id: true },
    });
    ids.push(row.id);
  }
  return ids;
}

/**
 * Delivers pending notifications (optionally only `ids`). Each row is claimed with an optimistic
 * update so concurrent dispatchers (request `after()` + cron) never send the same message twice.
 */
export async function dispatchNotifications(ids?: string[]): Promise<{ sent: number; failed: number }> {
  const candidates = await prisma.notification.findMany({
    where: {
      channel: { not: "IN_APP" },
      ...(ids ? { id: { in: ids } } : {}),
      OR: [{ status: "PENDING" }, { status: "FAILED", attempts: { lt: MAX_ATTEMPTS } }],
    },
    orderBy: { createdAt: "asc" },
    take: ids ? ids.length : 50,
  });
  if (candidates.length === 0) return { sent: 0, failed: 0 };

  const settings = await loadSettings();
  let sent = 0;
  let failed = 0;

  for (const notification of candidates) {
    const claimed = await prisma.notification.updateMany({
      where: { id: notification.id, status: notification.status, attempts: notification.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;

    const createSender = SENDERS[notification.channel];
    if (!createSender || !notification.recipient) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: "SKIPPED", lastError: `No sender configured for ${notification.channel}` },
      });
      continue;
    }

    try {
      const message = renderNotification(
        notification.template as GuestTemplate | StaffTemplate,
        notification.locale,
        notification.payload as NotificationPayload,
        settings.agency.name,
      );
      await createSender().send({ to: notification.recipient, subject: message.subject, html: message.html, text: message.text });
      await prisma.notification.update({ where: { id: notification.id }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
      sent++;
    } catch (error) {
      failed++;
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: "FAILED", lastError: error instanceof Error ? error.message.slice(0, 500) : String(error) },
      });
      console.error(`[notifications] ${notification.template} → ${notification.recipient} failed`, error);
    }
  }
  return { sent, failed };
}
