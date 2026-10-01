import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { absoluteUrl, env, isProduction } from "../env";

/**
 * Guests reach their reservation through a signed link (no account needed).
 * token = HMAC-SHA256(APP_SECRET, "<reservationId>:<accessVersion>")
 * Nothing secret is stored in the database; bumping `accessVersion` revokes every link sent so far.
 */

export function guestAccessToken(reservation: { id: string; accessVersion: number }): string {
  return createHmac("sha256", env.APP_SECRET).update(`${reservation.id}:${reservation.accessVersion}`).digest("base64url");
}

export function isValidGuestToken(reservation: { id: string; accessVersion: number }, token: string | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(guestAccessToken(reservation));
  const received = Buffer.from(token);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Link emailed to the guest. It swaps the token for a cookie and redirects to a clean URL. */
export function guestAccessUrl(reservation: { id: string; code: string; accessVersion: number; locale: string }): string {
  const prefix = reservation.locale === "es" ? "" : `/${reservation.locale}`;
  return absoluteUrl(`${prefix}/reserva/${reservation.code}/acceso?t=${guestAccessToken(reservation)}`);
}

function cookieName(code: string): string {
  return `rm_rsv_${code.replace(/[^A-Z0-9-]/gi, "")}`;
}

export async function setGuestAccessCookie(code: string, token: string): Promise<void> {
  (await cookies()).set(cookieName(code), token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}

export async function readGuestAccessCookie(code: string): Promise<string | undefined> {
  return (await cookies()).get(cookieName(code))?.value;
}
