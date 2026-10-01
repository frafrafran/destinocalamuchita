import "server-only";
import type { Metadata } from "next";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/i18n/config";
import { env } from "./env";

/** Public URL of a path for a locale (default locale has no prefix). */
export function localizedUrl(locale: Locale, path: string): string {
  const clean = path === "/" ? "" : path;
  return new URL(`${locale === DEFAULT_LOCALE ? "" : `/${locale}`}${clean}` || "/", env.APP_URL).toString();
}

/** Canonical + hreflang alternates for every translated page. */
export function alternatesFor(locale: Locale, path: string): Metadata["alternates"] {
  return {
    canonical: localizedUrl(locale, path),
    languages: {
      ...Object.fromEntries(LOCALES.map((l) => [l === "en" ? "en-US" : l === "pt" ? "pt-BR" : "es-AR", localizedUrl(l, path)])),
      "x-default": localizedUrl(DEFAULT_LOCALE, path),
    },
  };
}

/** Serialises JSON-LD safely (no `</script>` breakouts). */
export function jsonLd(data: unknown): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}

export const metadataBase = new URL(env.APP_URL);
