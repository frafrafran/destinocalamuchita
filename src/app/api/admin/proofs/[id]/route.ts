import { NextResponse } from "next/server";
import { can } from "@/server/auth/permissions";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { storage } from "@/server/storage";

/**
 * Streams a payment receipt from private storage to authorised staff only.
 * Files never get a public URL; responses are never cached and never sniffed.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/admin/proofs/[id]">) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "payments:read")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const proof = await prisma.paymentProof.findUnique({ where: { id }, select: { storageKey: true, mimeType: true, fileName: true } });
  if (!proof) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const object = await storage().get("private", proof.storageKey);
  if (!object) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const download = new URL(request.url).searchParams.has("download");
  const safeName = proof.fileName.replace(/[^\w.-]/g, "_");
  return new NextResponse(new Uint8Array(object.body), {
    headers: {
      "Content-Type": proof.mimeType,
      "Content-Length": String(object.body.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'",
    },
  });
}
