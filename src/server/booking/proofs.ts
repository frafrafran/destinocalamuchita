import "server-only";
import { randomUUID } from "node:crypto";
import { centsToDecimalString } from "@/lib/money";
import { EXPIRING_STATUSES, canUploadProof } from "@/lib/reservation-status";
import { ActionError } from "../action-result";
import { audit } from "../audit";
import { prisma } from "../db";
import { queueGuestNotification, queueStaffAlert } from "../notifications";
import { storage } from "../storage";
import { processProofFile, sanitizeFileName } from "../uploads";
import { reservationPayload } from "./payload";

export const MAX_PROOFS_PER_RESERVATION = 5;

export interface ProofUploadInput {
  reservationId: string;
  file: File;
  declaredAmount: number | null;
  ip: string;
}

/**
 * Stores a transfer receipt and moves the reservation to PROOF_RECEIVED.
 * The file is written to private storage first; if the database step fails it is removed again.
 */
export async function submitPaymentProof(input: ProofUploadInput): Promise<{ proofId: string; notificationIds: string[] }> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: input.reservationId },
    include: {
      guest: true,
      property: { select: { title: true, checkInTime: true, checkOutTime: true } },
      payments: { orderBy: { createdAt: "asc" }, include: { _count: { select: { proofs: true } } } },
    },
  });
  if (!reservation) throw new ActionError("NOT_FOUND");
  if (!canUploadProof(reservation.status)) throw new ActionError("INVALID_STATE", { status: reservation.status });
  const payment = reservation.payments[0];
  if (!payment) throw new ActionError("INVALID_STATE");
  if (payment._count.proofs >= MAX_PROOFS_PER_RESERVATION) throw new ActionError("TOO_MANY_FILES", { max: MAX_PROOFS_PER_RESERVATION });

  const processed = await processProofFile(input.file);
  const storageKey = `proofs/${reservation.id}/${randomUUID()}.${processed.extension}`;
  await storage().put("private", storageKey, processed.buffer, processed.mimeType);

  try {
    return await prisma.$transaction(async (tx) => {
      // Move out of the expiring states atomically; if the hold expired meanwhile, refuse.
      if ((EXPIRING_STATUSES as readonly string[]).includes(reservation.status)) {
        const moved = await tx.reservation.updateMany({
          where: { id: reservation.id, status: { in: [...EXPIRING_STATUSES] } },
          data: { status: "PROOF_RECEIVED", holdExpiresAt: null },
        });
        if (moved.count === 0) throw new ActionError("INVALID_STATE", { status: "EXPIRED" });
      }

      const proof = await tx.paymentProof.create({
        data: {
          paymentId: payment.id,
          storageKey,
          fileName: sanitizeFileName(input.file.name),
          mimeType: processed.mimeType,
          sizeBytes: processed.buffer.byteLength,
          sha256: processed.sha256,
          declaredAmount: input.declaredAmount === null ? null : centsToDecimalString(input.declaredAmount),
          uploaderIp: input.ip,
        },
      });

      await audit(tx, { type: "GUEST", ip: input.ip }, "proof.uploaded", { type: "PaymentProof", id: proof.id }, {
        reservationId: reservation.id,
        sizeBytes: proof.sizeBytes,
        mimeType: proof.mimeType,
      });

      const payload = reservationPayload(reservation, { declaredAmount: input.declaredAmount });
      const notificationIds = [
        await queueGuestNotification(tx, "PROOF_RECEIVED", { reservationId: reservation.id, email: reservation.guest.email, locale: reservation.locale }, payload),
        ...(await queueStaffAlert(tx, "ADMIN_NEW_PROOF", payload, reservation.id)),
      ];
      return { proofId: proof.id, notificationIds };
    });
  } catch (error) {
    await storage().delete("private", storageKey).catch(() => undefined);
    throw error;
  }
}

/** Other reservations where the exact same file was uploaded (possible reused receipt). */
export async function findDuplicateProofs(proofIds: string[]) {
  if (proofIds.length === 0) return new Map<string, { code: string; reservationId: string }[]>();
  const proofs = await prisma.paymentProof.findMany({
    where: { id: { in: proofIds } },
    select: { id: true, sha256: true, payment: { select: { reservationId: true } } },
  });
  const twins = await prisma.paymentProof.findMany({
    where: { sha256: { in: proofs.map((p) => p.sha256) }, id: { notIn: proofIds } },
    select: { sha256: true, payment: { select: { reservation: { select: { id: true, code: true } } } } },
  });
  const result = new Map<string, { code: string; reservationId: string }[]>();
  for (const proof of proofs) {
    const matches = twins
      .filter((twin) => twin.sha256 === proof.sha256 && twin.payment.reservation.id !== proof.payment.reservationId)
      .map((twin) => ({ code: twin.payment.reservation.code, reservationId: twin.payment.reservation.id }));
    if (matches.length) result.set(proof.id, matches);
  }
  return result;
}
