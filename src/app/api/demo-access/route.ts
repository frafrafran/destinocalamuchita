import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { audit } from "@/server/audit";
import { createSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { absoluteUrl, env } from "@/server/env";
import { consumeRateLimit } from "@/server/rate-limit";
import { ipFromRequest } from "@/server/request";

/**
 * Private link to the admin panel for demonstrations: /api/demo-access?key=<DEMO_ACCESS_KEY>.
 * Opens a normal administrator session without the password step. It only exists while the
 * DEMO_ACCESS_KEY secret is set; delete the secret to disable it. Anyone holding the link is an
 * administrator, so share it only with people who should manage the site.
 */
export async function GET(request: Request) {
  const notFound = () => new NextResponse(null, { status: 404 });
  const expected = env.DEMO_ACCESS_KEY;
  if (!expected) return notFound();

  const ip = ipFromRequest(request);
  const limit = await consumeRateLimit(`demo-access:${ip}`, 10, 15 * 60);
  if (!limit.allowed) return new NextResponse(null, { status: 429 });

  const key = new URL(request.url).searchParams.get("key") ?? "";
  const given = Buffer.from(key);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return notFound();

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true }, orderBy: { createdAt: "asc" } });
  if (!admin) return notFound();

  await createSession(admin.id, { ip, userAgent: request.headers.get("user-agent") });
  await audit(prisma, { type: "USER", id: admin.id, ip }, "auth.demo_access", { type: "User", id: admin.id });
  return NextResponse.redirect(absoluteUrl("/admin"), { status: 303 });
}
