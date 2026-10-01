import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/config";
import { listPublishedSlugs } from "@/server/queries/public";
import { localizedUrl } from "@/server/seo";

export const dynamic = "force-dynamic";

const STATIC_PATHS = ["/", "/propiedades", "/contacto", "/terminos", "/cancelaciones", "/privacidad"];

/** Every public page in every language, with hreflang alternates. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const properties = await listPublishedSlugs();
  const entry = (path: string, lastModified?: Date, priority = 0.6): MetadataRoute.Sitemap[number] => ({
    url: localizedUrl("es", path),
    lastModified,
    priority,
    alternates: { languages: Object.fromEntries(LOCALES.map((locale) => [locale, localizedUrl(locale, path)])) },
  });
  return [
    ...STATIC_PATHS.map((path) => entry(path, undefined, path === "/" ? 1 : path === "/propiedades" ? 0.9 : 0.4)),
    ...properties.map((property) => entry(`/propiedades/${property.slug}`, property.updatedAt, 0.8)),
  ];
}
