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
 * Building for the Cloudflare Worker: `npm run cf:build` sets CF_BUILD=1, and OpenNext itself sets
 * NEXT_PRIVATE_STANDALONE before calling `next build` (so a CI running plain `opennextjs-cloudflare build`
 * gets the same result). Nothing else in this project builds in standalone mode.
 */
const cloudflareBuild = process.env.CF_BUILD === "1" || process.env.NEXT_PRIVATE_STANDALONE === "true";

/**
 * The Worker uses the Prisma client generated for workerd, and Node-only packages (native image library,
 * SMTP, AWS SDK) are swapped for a stub the Worker never calls (it uses the Images binding, Resend and R2).
 */
const cloudflareAliases: Record<string, string> =
  cloudflareBuild
    ? {
        "@/generated/prisma/client": "./src/generated/prisma-cf/client.ts",
        "@/generated/prisma/enums": "./src/generated/prisma-cf/enums.ts",
        sharp: "./src/server/unavailable-on-workers.ts",
        nodemailer: "./src/server/unavailable-on-workers.ts",
        "@aws-sdk/client-s3": "./src/server/unavailable-on-workers.ts",
      }
    : {};

/**
 * The WASM loader Turbopack uses for the Prisma query compiler resolves chunks through a dynamic path,
 * so file tracing matches the whole project and OpenNext would pack every .wasm it finds (Prisma CLI,
 * embedded databases, test browsers…) into the Worker. None of these run in production.
 */
const cloudflareTracingExcludes =
  cloudflareBuild
    ? {
        "*": [
          "node_modules/prisma/**",
          "node_modules/@prisma/dev/**",
          "node_modules/@prisma/engines/**",
          "node_modules/@prisma/client/runtime/*.wasm",
          "node_modules/@prisma/client/runtime/*wasm-base64*",
          "node_modules/@prisma/client/runtime/query_compiler_*",
          "node_modules/@electric-sql/**",
          "node_modules/@embedded-postgres/**",
          "node_modules/embedded-postgres/**",
          "node_modules/playwright/**",
          "node_modules/playwright-core/**",
          "node_modules/@playwright/**",
          "node_modules/next-intl-swc-plugin-extractor/**",
          "node_modules/@swc/core/**",
          "node_modules/@swc/core-*/**",
          "node_modules/next/dist/compiled/@vercel/og/**",
          "node_modules/sharp/**",
          "node_modules/@img/**",
          "node_modules/wrangler/**",
          "node_modules/workerd/**",
          "node_modules/@cloudflare/workerd-*/**",
          "node_modules/esbuild/**",
          "node_modules/@esbuild/**",
          "node_modules/typescript/**",
          "node_modules/vitest/**",
          "node_modules/vite/**",
          "node_modules/@vitest/**",
          "node_modules/tsx/**",
          "node_modules/eslint*/**",
          "node_modules/@aws-sdk/**",
          "node_modules/@smithy/**",
          "node_modules/nodemailer/**",
          "src/generated/prisma/**",
          "tests/**",
          "storage/**",
          ".data/**",
        ],
      }
    : undefined;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingExcludes: cloudflareTracingExcludes,
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
