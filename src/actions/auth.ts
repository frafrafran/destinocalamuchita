"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { type ActionResult, ActionError, parseInput, runAction } from "@/server/action-result";
import { audit } from "@/server/audit";
import { burnPasswordCheck, verifyPassword } from "@/server/auth/crypto";
import { createSession, destroyCurrentSession, getCurrentUser } from "@/server/auth/session";
import { STAFF_ROLES } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { consumeRateLimit } from "@/server/rate-limit";
import { getClientIp, getUserAgent } from "@/server/request";

const loginSchema = z.object({
  email: z.email().trim().toLowerCase().max(120),
  password: z.string().min(1).max(200),
  next: z.string().max(300).optional(),
});

/** Only same-site admin paths are allowed as post-login destinations (no open redirects). */
function safeNext(next: string | undefined): string {
  if (!next) return "/admin";
  const withoutLocale = next.replace(/^\/(en|pt)(?=\/)/, "");
  return /^\/admin(\/[\w\-/]*)?(\?[\w=&%-]*)?$/.test(withoutLocale) ? withoutLocale : "/admin";
}

export async function loginAction(input: z.input<typeof loginSchema>): Promise<ActionResult<never>> {
  const locale = await getLocale();
  const result = await runAction(async () => {
    const t = await getTranslations("validation");
    const data = parseInput(loginSchema, input, t);
    const ip = await getClientIp();

    // Per IP and per account, so neither spraying nor targeted guessing scales.
    const [byIp, byAccount] = await Promise.all([
      consumeRateLimit(`login-ip:${ip}`, 20, 900),
      consumeRateLimit(`login-account:${data.email}`, 8, 900),
    ]);
    if (!byIp.allowed || !byAccount.allowed) throw new ActionError("RATE_LIMITED");

    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || !user.isActive || !STAFF_ROLES.includes(user.role)) {
      await burnPasswordCheck(data.password);
      throw new ActionError("INVALID_CREDENTIALS");
    }
    if (!(await verifyPassword(user.passwordHash, data.password))) {
      await audit(prisma, { type: "USER", id: user.id, ip }, "auth.login_failed", { type: "User", id: user.id });
      throw new ActionError("INVALID_CREDENTIALS");
    }

    await createSession(user.id, { ip, userAgent: await getUserAgent() });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(prisma, { type: "USER", id: user.id, ip }, "auth.login", { type: "User", id: user.id });
    return safeNext(data.next);
  });
  if (result.ok) return redirect({ href: result.data, locale });
  return result;
}

export async function logoutAction(): Promise<void> {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (user) await audit(prisma, { type: "USER", id: user.id, ip: await getClientIp() }, "auth.logout", { type: "User", id: user.id });
  await destroyCurrentSession();
  redirect({ href: "/login", locale });
}
