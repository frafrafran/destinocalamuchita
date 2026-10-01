import { NextResponse } from "next/server";
import { DEFAULT_LOCALE, toLocale } from "@/i18n/config";
import { isValidGuestToken, setGuestAccessCookie } from "@/server/booking/guest-access";
import { prisma } from "@/server/db";
import { consumeRateLimit } from "@/server/rate-limit";
import { ipFromRequest } from "@/server/request";

/**
 * Entry point of the emailed link: /reserva/RMS-XXXXXX/acceso?t=<token>.
 * Swaps the token for an httpOnly cookie and redirects to the clean reservation URL, so the token
 * never stays in the address bar, history or Referer headers.
 */
export async function GET(request: Request, { params }: RouteContext<"/[locale]/reserva/[code]/acceso">) {
  const { locale: raw, code: rawCode } = await params;
  const locale = toLocale(raw);
  const prefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  const code = rawCode.toUpperCase();
  const token = new URL(request.url).searchParams.get("t") ?? undefined;

  const limit = await consumeRateLimit(`access:${ipFromRequest(request)}`, 30, 600);
  const reservation = limit.allowed && /^RMS-[A-Z0-9]{6}$/.test(code)
    ? await prisma.reservation.findUnique({ where: { code }, select: { id: true, code: true, accessVersion: true } })
    : null;

  if (!reservation || !isValidGuestToken(reservation, token)) {
    return NextResponse.redirect(new URL(`${prefix}/reserva?code=${encodeURIComponent(code)}&invalid=1`, request.url));
  }

  await setGuestAccessCookie(reservation.code, token!);
  return NextResponse.redirect(new URL(`${prefix}/reserva/${reservation.code}`, request.url));
}
