import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/server/env";

// Rendered per request: the sitemap URL comes from APP_URL, which only exists at runtime on Cloudflare.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/en/admin", "/pt/admin", "/login", "/api/", "/reserva/", "/reservar/", "/en/reserva/", "/pt/reserva/", "/en/reservar/", "/pt/reservar/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
