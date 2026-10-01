import { NextResponse } from "next/server";
import { storage } from "@/server/storage";

/**
 * Serves the public bucket for STORAGE_DRIVER=local (development) and r2 (Cloudflare bindings).
 * With S3 the photos have their own public URL and this route is never referenced.
 */
export async function GET(_request: Request, { params }: RouteContext<"/media/[...key]">) {
  const { key } = await params;
  const path = key.join("/");
  if (!path.startsWith("properties/")) return new NextResponse(null, { status: 404 });
  try {
    const object = await storage().get("public", path);
    if (!object) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(object.body), {
      headers: {
        "Content-Type": object.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
