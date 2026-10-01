import { after, NextResponse } from "next/server";
import { isValidGuestToken, readGuestAccessCookie } from "@/server/booking/guest-access";
import { submitPaymentProof } from "@/server/booking/proofs";
import { ActionError } from "@/server/action-result";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { dispatchNotifications } from "@/server/notifications";
import { consumeRateLimit } from "@/server/rate-limit";
import { ipFromRequest, isSameOrigin } from "@/server/request";
import { parseMoneyInput } from "@/lib/money";

export const runtime = "nodejs";

const error = (code: string, status: number, details?: Record<string, unknown>) => NextResponse.json({ ok: false, error: code, details }, { status });

/** Guest uploads a transfer receipt. Auth: the reservation access cookie (never a URL token). */
export async function POST(request: Request, { params }: RouteContext<"/api/reservations/[code]/proof">) {
  if (!isSameOrigin(request, env.APP_URL)) return error("FORBIDDEN", 403);
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  const ip = ipFromRequest(request);

  const limit = await consumeRateLimit(`proof:${ip}`, 12, 3600);
  if (!limit.allowed) return error("RATE_LIMITED", 429);

  const reservation = await prisma.reservation.findUnique({ where: { code }, select: { id: true, accessVersion: true } });
  if (!reservation || !isValidGuestToken(reservation, await readGuestAccessCookie(code))) return error("UNAUTHORIZED", 401);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return error("FILE_TYPE", 400);
  const rawAmount = String(form?.get("declaredAmount") ?? "").trim();
  let declaredAmount: number | null = null;
  if (rawAmount) {
    try {
      declaredAmount = parseMoneyInput(rawAmount);
    } catch {
      return error("VALIDATION", 400, { field: "declaredAmount" });
    }
  }

  try {
    const result = await submitPaymentProof({ reservationId: reservation.id, file, declaredAmount, ip });
    after(() => dispatchNotifications(result.notificationIds));
    return NextResponse.json({ ok: true });
  } catch (cause) {
    if (cause instanceof ActionError) return error(cause.code, 400, cause.details);
    console.error("[proof-upload] unexpected error", cause);
    return error("UNKNOWN", 500);
  }
}
