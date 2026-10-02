import { HouseLineIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PropertyCard } from "@/components/property/property-card";
import { CatalogToolbar } from "@/components/search/catalog-toolbar";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { todayISO } from "@/lib/dates";
import { parseCatalogParams, stayQuery } from "@/lib/search-params";
import { getSearchFacets, searchProperties } from "@/server/queries/public";
import { alternatesFor } from "@/server/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/propiedades">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "catalog" });
  return { title: t("metaTitle"), description: t("metaDescription"), alternates: alternatesFor(locale as Locale, "/propiedades") };
}

export default async function CatalogPage({ params, searchParams }: PageProps<"/[locale]/propiedades">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const filters = parseCatalogParams(await searchParams);
  const [t, result, facets] = await Promise.all([getTranslations("catalog"), searchProperties(filters, locale), getSearchFacets()]);
  const query = stayQuery(filters);

  const results = (
    <section aria-labelledby="results-heading" className="pt-8 pb-24">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="results-heading" className="text-sm text-ink-3" aria-live="polite">
          {filters.checkIn ? t("resultsWithDates", { count: result.total }) : t("results", { count: result.total })}
        </h2>
        {result.unavailableCount > 0 ? <p className="text-sm text-ink-3">{t("hiddenUnavailable", { count: result.unavailableCount })}</p> : null}
      </div>
      {result.items.length ? (
        <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-6 sm:gap-y-12 xl:grid-cols-3">
          {result.items.map((property, index) => (
            <PropertyCard key={property.id} property={property} locale={locale} query={query} priority={index < 3} />
          ))}
        </div>
      ) : (
        <EmptyState
          className="mt-8"
          icon={<HouseLineIcon size={24} />}
          title={t("emptyTitle")}
          description={filters.checkIn ? t("emptyWithDates") : t("emptyDescription")}
          action={
            <Link href="/propiedades" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              {t("seeAll")}
            </Link>
          }
        />
      )}
    </section>
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-[100px] sm:px-6 lg:px-10">
      <header className="pb-6">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{filters.city ?? t("title")}</h1>
        <p className="mt-2 max-w-2xl text-ink-3">{t("subtitle")}</p>
      </header>
      <CatalogToolbar facets={facets} today={todayISO()} resultsSlot={results} />
    </div>
  );
}
