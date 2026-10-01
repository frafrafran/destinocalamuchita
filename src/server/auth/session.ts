import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import type { UserRole } from "@/generated/prisma/enums";
import { prisma } from "../db";
import { isProduction } from "../env";
import { generateToken, sha256 } from "./crypto";
import { STAFF_ROLES } from "./permissions";

export const SESSION_COOKIE = "rm_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  ownerId: string | null;
  sessionId: string;
}

export async function createSession(userId: string, meta: { ip: string; userAgent: string | null }): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { id: sha256(token), userId, expiresAt, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

async function validateToken(token: string): Promise<SessionUser | null> {
  const session = await prisma.session.findUnique({
    where: { id: sha256(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true, ownerId: true, isActive: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now() || !session.user.isActive || !STAFF_ROLES.includes(session.user.role)) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  const { user } = session;
  return { id: user.id, email: user.email, name: user.name, role: user.role, ownerId: user.ownerId, sessionId: session.id };
}

/** Current staff user for this request (deduplicated across components). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateToken(token);
});

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: sha256(token) } });
  store.delete(SESSION_COOKIE);
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

export async function purgeExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return result.count;
}
