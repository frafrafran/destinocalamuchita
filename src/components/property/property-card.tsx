import { StarIcon } from "@phosphor-icons/react/ssr";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PropertyCardData } from "@/server/queries/public";

interface Props {
  property: PropertyCardData;
  locale: Locale;
  sizes?: string;
  priority?: boolean;
  /** Query string carried to the property page (dates and guests from the search). */
  query?: string;
  className?: string;
  aspect?: "landscape" | "portrait" | "wide";
}

const ASPECTS = { landscape: "aspect-[4/3]", portrait: "aspect-[4/5]", wide: "aspect-[16/10]" };

export async function PropertyCard({ property, locale, sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw", priority, query, className, aspect = "landscape" }: Props) {
  const t = await getTranslations("property");
  const types = await getTranslations("propertyTypes");
  const [cover, second] = property.images;
  const rating = property.ratingAverage
    ? new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(property.ratingAverage)
    : null;

  return (
    <article className={cn("group relative", className)}>
      <Link href={`/propiedades/${property.slug}${query ? `?${query}` : ""}`} className="block rounded-2xl outline-offset-4">
        <div className={cn("relative overflow-hidden rounded-2xl bg-surface-2", ASPECTS[aspect])}>
          {cover ? (
            <Image
              src={cover.url}
              alt={cover.alt}
              fill
              sizes={sizes}
              priority={priority}
              className="object-cover transition-transform duration-[900ms] ease-(--ease-soft) group-hover:scale-[1.04]"
            />
          ) : null}
          {second ? (
            <Image
              src={second.url}
              alt=""
              aria-hidden
              fill
              sizes={sizes}
              className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100 max-md:hidden"
            />
          ) : null}
        </div>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-[17px] font-semibold tracking-tight text-ink">{property.title}</h3>
            <p className="mt-0.5 truncate text-sm text-ink-3">
              {property.city}, {types(property.type)}
            </p>
          </div>
          {rating ? (
            <p className="flex shrink-0 items-center gap-1 text-sm text-ink" aria-label={t("ratingLabel", { rating, count: property.ratingCount })}>
              <StarIcon size={14} weight="fill" className="text-ink" />
              <span className="tabular font-medium">{rating}</span>
              <span className="text-ink-3">({property.ratingCount})</span>
            </p>
          ) : property.isNew ? (
            <p className="shrink-0 text-sm font-medium text-accent-text">{t("new")}</p>
          ) : null}
        </div>

        <p className="mt-1.5 text-sm text-ink-3">
          {t("capacityShort", { guests: property.maxGuests, bedrooms: property.bedrooms, beds: property.beds })}
        </p>

        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {property.stay?.total ? (
            <p className="text-[15px] text-ink">
              <span className="tabular font-semibold">{formatMoney(property.stay.total, property.currency, locale)}</span>{" "}
              <span className="text-ink-3">{t("totalFor", { nights: property.stay.nights })}</span>
            </p>
          ) : (
            <p className="text-[15px] text-ink">
              <span className="text-ink-3">{t("from")} </span>
              <span className="tabular font-semibold">{formatMoney(property.fromPrice, property.currency, locale)}</span>{" "}
              <span className="text-ink-3">{t("perNight")}</span>
            </p>
          )}
          {property.stay?.available ? (
            <p className="text-xs font-medium text-success-fg">{t("availableForDates")}</p>
          ) : property.featured ? (
            <p className="inline-flex items-center gap-1 text-xs font-medium text-accent-text">
              <StarIcon size={12} weight="fill" />
              {t("featured")}
            </p>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
