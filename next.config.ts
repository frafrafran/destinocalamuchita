import type { NextConfig } from "next";

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  // Demo photography (Unsplash license). Remove once every property uses uploaded photos.
  { protocol: "https", hostname: "images.unsplash.com" },
];
if (process.env.S3_PUBLIC_BASE_URL) {
  const url = new URL(process.env.S3_PUBLIC_BASE_URL);
  remotePatterns.push({ protocol: url.protocol.replace(":", "") as "https" | "http", hostname: url.hostname });
}

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

/**
 * `npm run cf:build` sets CF_BUILD=1: the Cloudflare Worker uses the Prisma client generated for
 * workerd, and Node-only packages (native image library, SMTP, AWS SDK) are swapped for a stub that
 * the Worker never calls (it uses the Images binding, Resend and R2 bindings instead).
 */
const cloudflareAliases: Record<string, string> =
  process.env.CF_BUILD === "1"
    ? {
        "@/generated/prisma/client": "./src/generated/prisma-cf/client.ts",
        "@/generated/prisma/enums": "./src/generated/prisma-cf/enums.ts",
        sharp: "./src/server/unavailable-on-workers.ts",
        nodemailer: "./src/server/unavailable-on-workers.ts",
        "@aws-sdk/client-s3": "./src/server/unavailable-on-workers.ts",
      }
    : {};

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns,
    formats: ["image/avif", "image/webp"],
    qualities: [60, 75, 85],
  },
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react", "recharts", "date-fns"],
  },
  turbopack: {
    // What `next-intl/plugin` would configure. Set directly because the plugin eagerly loads
    // @swc/core (only needed for its optional message extractor), whose native binary can be
    // blocked by Windows permission checks.
    resolveAlias: { "next-intl/config": "./src/i18n/request.ts", ...cloudflareAliases },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
