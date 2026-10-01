import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with scrypt (OWASP parameters N=2^14, r=8, p=5: 16 MiB, runs natively on Node.js
 * and on Cloudflare Workers, where Argon2 is unavailable). Stored as
 * `scrypt$N$r$p$salt$hash` (base64url), so the parameters can be raised later without breaking
 * existing hashes. No `server-only` import: the seed script uses it too.
 */
const N = 16_384;
const R = 8;
const P = 5;
const KEY_LENGTH = 32;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, length, { N: n, r, p, maxmem: MAX_MEMORY }, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P, KEY_LENGTH);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, "base64url");
    const actual = await derive(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p), expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
