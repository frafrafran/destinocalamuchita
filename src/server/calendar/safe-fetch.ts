import "server-only";
import { resolve4, resolve6 } from "node:dns/promises";
import net from "node:net";

/**
 * Fetches a remote calendar without letting an admin-supplied URL reach internal services (SSRF):
 * HTTPS only, no credentials in the URL, every resolved address must be public, redirects are
 * re-validated hop by hop, and the body is size- and time-limited.
 */

export class UnsafeUrlError extends Error {}

const PRIVATE_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

export function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const value = ipv4ToInt(address);
    return PRIVATE_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (value & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      /^fe[89ab]/.test(lower) ||
      lower.startsWith("ff")
    );
  }
  return true;
}

/** Normalises what admins paste (webcal:// links, stray spaces) and validates the shape. */
export function normaliseCalendarUrl(raw: string): URL {
  const trimmed = raw.trim().replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new UnsafeUrlError("INVALID_URL");
  }
  if (url.protocol !== "https:") throw new UnsafeUrlError("HTTPS_ONLY");
  if (url.username || url.password) throw new UnsafeUrlError("CREDENTIALS_IN_URL");
  if (url.port && url.port !== "443") throw new UnsafeUrlError("PORT_NOT_ALLOWED");
  if (net.isIP(url.hostname) && isPrivateAddress(url.hostname)) throw new UnsafeUrlError("PRIVATE_ADDRESS");
  return url;
}

/**
 * Every A and AAAA record must be public. resolve4/resolve6 (not lookup) because they also run on
 * Cloudflare Workers, where node:dns answers through DNS over HTTPS and lookup is not implemented.
 */
async function assertPublicHost(hostname: string): Promise<void> {
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new UnsafeUrlError("PRIVATE_ADDRESS");
    return;
  }
  const results = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
  const addresses = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  if (addresses.length === 0 || addresses.some((address) => isPrivateAddress(address))) {
    throw new UnsafeUrlError("PRIVATE_ADDRESS");
  }
}

export async function safeFetchText(
  rawUrl: string,
  { maxBytes = 5 * 1024 * 1024, timeoutMs = 15_000, maxRedirects = 3 } = {},
): Promise<string> {
  let url = normaliseCalendarUrl(rawUrl);
  const signal = AbortSignal.timeout(timeoutMs);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHost(url.hostname);
    const response = await fetch(url, {
      redirect: "manual",
      signal,
      headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1", "User-Agent": "DestinoCalamuchitaCalendarSync/1.0" },
      cache: "no-store",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`Redirect without location (${response.status})`);
      url = normaliseCalendarUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > maxBytes) throw new Error("Calendar feed too large");

    const reader = response.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new Error("Calendar feed too large");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  throw new Error("Too many redirects");
}
