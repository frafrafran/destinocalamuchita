import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/server/env";

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
