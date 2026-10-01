import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, LOCALES } from "./config";

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // Spanish (main market) lives at the root: /propiedades. Others are prefixed: /en/propiedades.
  localePrefix: "as-needed",
  localeCookie: { name: "rm_locale", maxAge: 60 * 60 * 24 * 365 },
});
