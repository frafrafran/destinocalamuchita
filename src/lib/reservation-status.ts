import type { ProofStatus, ReservationStatus } from "@/generated/prisma/enums";

/**
 * Statuses that occupy the calendar.
 * Keep in sync with the `Reservation_no_overlap` exclusion constraint (prisma/migrations/*_constraints).
 */
export const BLOCKING_STATUSES = [
  "PENDING",
  "AWAITING_PAYMENT",
  "PROOF_RECEIVED",
  "UNDER_REVIEW",
  "CONFIRMED",
  "COMPLETED",
] as const satisfies readonly ReservationStatus[];

/** Holds that expire when the guest does not send a receipt in time. */
export const EXPIRING_STATUSES = ["PENDING", "AWAITING_PAYMENT"] as const satisfies readonly ReservationStatus[];

/** Statuses in which the guest may upload a transfer receipt. */
export const PROOF_UPLOAD_STATUSES = [
  "PENDING",
  "AWAITING_PAYMENT",
  "PROOF_RECEIVED",
  "UNDER_REVIEW",
] as const satisfies readonly ReservationStatus[];

/** Statuses an admin may still act on (confirm, cancel, change dates…). */
export const OPEN_STATUSES = [
  "PENDING",
  "AWAITING_PAYMENT",
  "PROOF_RECEIVED",
  "UNDER_REVIEW",
  "CONFIRMED",
] as const satisfies readonly ReservationStatus[];

export function canUploadProof(status: ReservationStatus): boolean {
  return (PROOF_UPLOAD_STATUSES as readonly ReservationStatus[]).includes(status);
}

export type StatusTone = "neutral" | "info" | "warning" | "progress" | "success" | "danger" | "muted";

export const RESERVATION_STATUS_TONE: Record<ReservationStatus, StatusTone> = {
  PENDING: "neutral",
  AWAITING_PAYMENT: "warning",
  PROOF_RECEIVED: "info",
  UNDER_REVIEW: "progress",
  CONFIRMED: "success",
  REJECTED: "danger",
  CANCELLED: "muted",
  COMPLETED: "neutral",
  EXPIRED: "muted",
};

export const PROOF_STATUS_TONE: Record<ProofStatus, StatusTone> = {
  PENDING_REVIEW: "info",
  APPROVED: "success",
  REJECTED: "danger",
  RESUBMISSION_REQUESTED: "warning",
};

/** Guest-facing progress: which of the five booking steps a status corresponds to. */
export type BookingStep = "dates" | "details" | "payment" | "proof" | "confirmation";

export function bookingStepFor(status: ReservationStatus): BookingStep {
  switch (status) {
    case "PENDING":
    case "AWAITING_PAYMENT":
      return "payment";
    case "PROOF_RECEIVED":
    case "UNDER_REVIEW":
      return "proof";
    default:
      return "confirmation";
  }
}
