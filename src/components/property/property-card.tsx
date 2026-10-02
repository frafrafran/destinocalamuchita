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

const ASPECTS = { landscape: "aspect-[4/3]", portrait: "aspect-[4/5]", wide: "aspect-[4/3] md:aspect-[16/10]" };

export async function PropertyCard({ property, locale, sizes = "(min-width: 1280px) 33vw, 50vw", priority, query, className, aspect = "landscape" }: Props) {
  const t = await getTranslations("property");
  const types = await getTranslations("propertyTypes");
  const [cover, second] = property.images;
  const rating = property.ratingAverage
    ? new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(property.ratingAverage)
    : null;

  return (
    // Container queries: the card tightens its type when it is narrow (two per row on phones).
    <article className={cn("group relative @container", className)}>
      <Link href={`/propiedades/${property.slug}${query ? `?${query}` : ""}`} className="block rounded-xl outline-offset-4 @[13rem]:rounded-2xl">
        <div className={cn("relative overflow-hidden rounded-xl bg-surface-2 @[13rem]:rounded-2xl", ASPECTS[aspect])}>
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

        <div className="mt-2.5 flex flex-col @[13rem]:mt-4 @[13rem]:flex-row @[13rem]:items-start @[13rem]:justify-between @[13rem]:gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-ink @[13rem]:text-[17px]">{property.title}</h3>
            <p className="mt-0.5 truncate text-[13px] text-ink-3 @[13rem]:text-sm">
              {property.city}, {types(property.type)}
            </p>
          </div>
          {rating ? (
            <p className="mt-1 flex shrink-0 items-center gap-1 text-[13px] text-ink @[13rem]:mt-0 @[13rem]:text-sm" aria-label={t("ratingLabel", { rating, count: property.ratingCount })}>
              <StarIcon size={14} weight="fill" className="text-ink" />
              <span className="tabular font-medium">{rating}</span>
              <span className="text-ink-3">({property.ratingCount})</span>
            </p>
          ) : property.isNew ? (
            <p className="mt-1 shrink-0 text-[13px] font-medium text-accent-text @[13rem]:mt-0 @[13rem]:text-sm">{t("new")}</p>
          ) : null}
        </div>

        <p className="mt-1 text-[13px] leading-snug text-ink-3 @[13rem]:mt-1.5 @[13rem]:text-sm">
          {t("capacityShort", { guests: property.maxGuests, bedrooms: property.bedrooms, beds: property.beds })}
        </p>

        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {property.stay?.total ? (
            <p className="text-sm text-ink @[13rem]:text-[15px]">
              <span className="tabular font-semibold">{formatMoney(property.stay.total, property.currency, locale)}</span>{" "}
              <span className="text-ink-3">{t("totalFor", { nights: property.stay.nights })}</span>
            </p>
          ) : (
            <p className="text-sm text-ink @[13rem]:text-[15px]">
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
