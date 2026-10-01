import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ActionError } from "@/server/action-result";
import { audit } from "@/server/audit";
import { can } from "@/server/auth/permissions";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { consumeRateLimit } from "@/server/rate-limit";
import { ipFromRequest, isSameOrigin } from "@/server/request";
import { storage } from "@/server/storage";
import { processPropertyImage } from "@/server/uploads";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILES_PER_REQUEST = 12;
const MAX_IMAGES_PER_PROPERTY = 60;

/**
 * Uploads property photos (multipart, field "files"). Each file is validated by content,
 * re-encoded to WEBP and stored in the public bucket. Partial success is reported per file.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/admin/properties/[id]/images">) {
  if (!isSameOrigin(request, env.APP_URL)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user || !can(user.role, "properties:write")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const limit = await consumeRateLimit(`images:${user.id}`, 120, 3600);
  if (!limit.allowed) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const { id } = await params;
  const property = await prisma.property.findUnique({ where: { id }, select: { id: true, title: true, _count: { select: { images: true } } } });
  if (!property) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((value): value is File => value instanceof File).slice(0, MAX_FILES_PER_REQUEST);
  if (files.length === 0) return NextResponse.json({ error: "FILE_TYPE" }, { status: 400 });
  if (property._count.images + files.length > MAX_IMAGES_PER_PROPERTY) {
    return NextResponse.json({ error: "TOO_MANY_FILES", details: { max: MAX_IMAGES_PER_PROPERTY } }, { status: 400 });
  }

  const last = await prisma.propertyImage.findFirst({ where: { propertyId: id }, orderBy: { position: "desc" }, select: { position: true } });
  let position = (last?.position ?? -1) + 1;
  const results: { name: string; ok: boolean; error?: string }[] = [];

  for (const file of files) {
    try {
      const image = await processPropertyImage(file);
      const key = `properties/${id}/${randomUUID()}.webp`;
      await storage().put("public", key, image.buffer, "image/webp");
      await prisma.propertyImage.create({
        data: { propertyId: id, url: storage().publicUrl(key), storageKey: key, width: image.width, height: image.height, position: position++, alt: property.title },
      });
      results.push({ name: file.name, ok: true });
    } catch (error) {
      results.push({ name: file.name, ok: false, error: error instanceof ActionError ? error.code : "UNKNOWN" });
      if (!(error instanceof ActionError)) console.error("[image-upload]", error);
    }
  }

  await audit(prisma, { type: "USER", id: user.id, ip: ipFromRequest(request) }, "property.images_uploaded", { type: "Property", id }, {
    uploaded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });
  return NextResponse.json({ ok: true, results });
}
