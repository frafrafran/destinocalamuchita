import "server-only";
import { headers } from "next/headers";

/** Best-effort client IP (first hop of X-Forwarded-For on Vercel and most proxies). */
export async function getClientIp(): Promise<string> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return list.get("x-real-ip") ?? "unknown";
}

export async function getUserAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}

export function ipFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Route handlers that accept uploads are not covered by Server Actions' built-in origin check,
 * so they verify the Origin header themselves.
 */
export function isSameOrigin(request: Request, appUrl: string): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([new URL(appUrl).origin, new URL(request.url).origin]);
  return allowed.has(origin);
}
