import type { MetadataRoute } from "next";
import { absoluteUrl, env } from "@/server/env";

// Rendered per request: the sitemap URL comes from APP_URL, which only exists at runtime on Cloudflare.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  // A demonstration site with fictional listings must not end up in search results.
  if (env.DEMO_MODE) return { rules: [{ userAgent: "*", disallow: "/" }] };
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
