import {
  BathtubIcon,
  BedIcon,
  ClockIcon,
  DoorOpenIcon,
  EnvelopeSimpleIcon,
  HouseSimpleIcon,
  RulerIcon,
  StarIcon,
  UsersThreeIcon,
  WhatsappLogoIcon,
} from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AmenityIcon } from "@/components/amenity-icon";
import { AvailabilitySection } from "@/components/booking/availability-section";
import { BookingStateProvider } from "@/components/booking/booking-state";
import { BookingWidget, MobileBookingBar } from "@/components/booking/booking-widget";
import { type AmenityGroup, AmenitiesDialog } from "@/components/property/amenities-dialog";
import { LocationMap } from "@/components/property/location-map";
import { PropertyGallery } from "@/components/property/property-gallery";
import { buttonClasses } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { whatsappUrl } from "@/lib/contact";
import { isValidISODate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { toEmbedUrl } from "@/lib/video";
import { PUBLIC_CALENDAR_DAYS, getPublicProperty } from "@/server/queries/public";
import { alternatesFor, jsonLd, localizedUrl } from "@/server/seo";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

const AMENITY_PREVIEW = 10;

export async function generateMetadata({ params }: PageProps<"/[locale]/propiedades/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const property = await getPublicProperty(slug, locale as Locale);
  if (!property) return {};
  const t = await getTranslations({ locale, namespace: "propertyPage" });
  const types = await getTranslations({ locale, namespace: "propertyTypes" });
  const title = `${property.title}, ${property.city}`;
  const description = property.summary || t("metaFallback", { type: types(property.type), city: property.city, guests: property.maxGuests });
  const cover = property.images[0];
  return {
    title,
    description,
    alternates: alternatesFor(locale as Locale, `/propiedades/${slug}`),
    openGraph: {
      title,
      description,
      type: "website",
      images: cover ? [{ url: cover.url, width: cover.width, height: cover.height, alt: cover.alt }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description, images: cover ? [cover.url] : undefined },
  };
}

export default async function PropertyPage({ params, searchParams }: PageProps<"/[locale]/propiedades/[slug]">) {
  const { locale: raw, slug } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const query = await searchParams;
  const property = await getPublicProperty(slug, locale);
  if (!property) notFound();

  const [t, types, amenitiesT, nav, settings] = await Promise.all([
    getTranslations("propertyPage"),
    getTranslations("propertyTypes"),
    getTranslations("amenities"),
    getTranslations("nav"),
    getSettings(),
  ]);

  const amenityLabel = (key: string, fallback: string) => (amenitiesT.has(key) ? amenitiesT(key) : fallback);
  const groups = Object.values(
    property.amenities.reduce<Record<string, AmenityGroup>>((acc, amenity) => {
      const categoryKey = `categories.${amenity.category}`;
      acc[amenity.category] ??= {
        category: amenity.category,
        label: amenitiesT.has(categoryKey) ? amenitiesT(categoryKey) : amenity.category,
        items: [],
      };
      acc[amenity.category]!.items.push({ key: amenity.key, label: amenityLabel(amenity.key, amenity.label), icon: amenity.icon });
      return acc;
    }, {}),
  );

  const cancellation = property.cancellationPolicy || settings.policies.cancellation[locale] || settings.policies.cancellation.es;
  const rules = property.houseRules.split("\n").map((line) => line.trim()).filter(Boolean);
  const embed = toEmbedUrl(property.videoUrl);
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const initialCheckIn = first(query.checkIn);
  const initialCheckOut = first(query.checkOut);
  const agency = settings.agency;
  const rating = property.ratingAverage
    ? new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(property.ratingAverage)
    : null;

  const facts = [
    { icon: UsersThreeIcon, label: t("facts.guests", { count: property.maxGuests }) },
    { icon: DoorOpenIcon, label: t("facts.bedrooms", { count: property.bedrooms }) },
    { icon: BedIcon, label: t("facts.beds", { count: property.beds }) },
    { icon: BathtubIcon, label: t("facts.bathrooms", { count: property.bathrooms }) },
    ...(property.areaM2 ? [{ icon: RulerIcon, label: t("facts.area", { area: property.areaM2 }) }] : []),
  ];

  const url = localizedUrl(locale, `/propiedades/${property.slug}`);
  const structured = [
    {
      "@context": "https://schema.org",
      "@type": "VacationRental",
      "@id": url,
      identifier: property.id,
      name: property.title,
      description: property.summary,
      url,
      image: property.images.slice(0, 8).map((image) => image.url),
      ...(property.latitude !== null && property.longitude !== null
        ? { latitude: Number(property.latitude.toFixed(2)), longitude: Number(property.longitude.toFixed(2)) }
        : {}),
      address: { "@type": "PostalAddress", addressLocality: property.city, addressRegion: property.region, addressCountry: property.country },
      checkinTime: property.checkInTime,
      checkoutTime: property.checkOutTime,
      containsPlace: {
        "@type": "Accommodation",
        additionalType: "EntirePlace",
        occupancy: { "@type": "QuantitativeValue", maxValue: property.maxGuests },
        numberOfBedrooms: property.bedrooms,
        numberOfBathroomsTotal: property.bathrooms,
        ...(property.areaM2 ? { floorSize: { "@type": "QuantitativeValue", value: property.areaM2, unitCode: "MTK" } } : {}),
        amenityFeature: property.amenities.map((amenity) => ({ "@type": "LocationFeatureSpecification", name: amenityLabel(amenity.key, amenity.label), value: true })),
      },
      ...(property.ratingAverage && property.ratingCount
        ? { aggregateRating: { "@type": "AggregateRating", ratingValue: property.ratingAverage, ratingCount: property.ratingCount, bestRating: 5 } }
        : {}),
      priceRange: `${formatMoney(property.fromPrice, property.pricing.property.currency, locale)}+`,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: agency.name, item: localizedUrl(locale, "/") },
        { "@type": "ListItem", position: 2, name: nav("properties"), item: localizedUrl(locale, "/propiedades") },
        { "@type": "ListItem", position: 3, name: property.title, item: url },
      ],
    },
  ];

  return (
    <BookingStateProvider
      blocked={property.blocked}
      pricing={property.pricing}
      today={property.today}
      slug={property.slug}
      horizonDays={PUBLIC_CALENDAR_DAYS}
      initial={{
        checkIn: isValidISODate(initialCheckIn) ? initialCheckIn : undefined,
        checkOut: isValidISODate(initialCheckOut) ? initialCheckOut : undefined,
        guests: Number(first(query.guests)) || undefined,
      }}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structured)} />
      <div className="mx-auto max-w-[1280px] px-4 pt-[88px] pb-28 sm:px-6 lg:px-10 lg:pb-24">
        <nav aria-label={t("breadcrumb")} className="py-4 text-sm text-ink-3">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/propiedades" className="hover:text-ink">
                {nav("properties")}
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href={`/propiedades?city=${encodeURIComponent(property.city)}`} className="hover:text-ink">
                {property.city}
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-ink-2">
              {property.title}
            </li>
          </ol>
        </nav>

        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">{property.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-3">
              {rating ? (
                <span className="flex items-center gap-1 text-ink">
                  <StarIcon size={15} weight="fill" />
                  <span className="tabular font-medium">{rating}</span>
                  <span className="text-ink-3">({t("reviews", { count: property.ratingCount })})</span>
                </span>
              ) : null}
              <span>
                {property.city}, {property.region}
              </span>
              <span className="flex items-center gap-1.5">
                <HouseSimpleIcon size={15} />
                {types(property.type)}
              </span>
            </p>
          </div>
        </header>

        <PropertyGallery images={property.images} title={property.title} />

        <div className="mt-10 grid gap-16 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-20">
          <div className="min-w-0">
            <ul className="flex flex-wrap gap-x-7 gap-y-3 border-b border-line pb-8 text-ink-2">
              {facts.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2.5">
                  <Icon size={20} className="text-ink-3" />
                  {label}
                </li>
              ))}
            </ul>

            <section className="border-b border-line py-10">
              {property.summary ? <p className="text-xl leading-relaxed font-medium tracking-tight text-ink">{property.summary}</p> : null}
              <div className="mt-6 max-w-[68ch] space-y-4 leading-relaxed text-ink-2">
                {property.description
                  .split(/\n{2,}/)
                  .filter(Boolean)
                  .map((paragraph) => (
                    <p key={paragraph.slice(0, 40)} className="whitespace-pre-line">
                      {paragraph}
                    </p>
                  ))}
              </div>
            </section>

            {embed ? (
              <section className="border-b border-line py-10">
                <h2 className="text-xl font-semibold tracking-tight">{t("video")}</h2>
                <div className="mt-6 aspect-video overflow-hidden rounded-2xl bg-surface-2">
                  <iframe
                    src={embed}
                    title={t("videoTitle", { title: property.title })}
                    loading="lazy"
                    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="size-full"
                  />
                </div>
              </section>
            ) : null}

            {property.amenities.length ? (
              <section className="border-b border-line py-10">
                <h2 className="text-xl font-semibold tracking-tight">{t("amenities")}</h2>
                <ul className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                  {property.amenities.slice(0, AMENITY_PREVIEW).map((amenity) => (
                    <li key={amenity.key} className="flex items-center gap-3.5 text-ink-2">
                      <AmenityIcon name={amenity.icon} size={22} className="text-ink" />
                      {amenityLabel(amenity.key, amenity.label)}
                    </li>
                  ))}
                </ul>
                {property.amenities.length > AMENITY_PREVIEW ? <AmenitiesDialog groups={groups} total={property.amenities.length} /> : null}
              </section>
            ) : null}

            <section id="disponibilidad" className="scroll-mt-24 border-b border-line py-10">
              <h2 className="text-xl font-semibold tracking-tight">{t("availability")}</h2>
              <p className="mt-1.5 mb-6 text-sm text-ink-3">{t("availabilityHint")}</p>
              <AvailabilitySection />
            </section>

            <section className="grid gap-10 border-b border-line py-10 sm:grid-cols-2">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{t("schedule")}</h2>
                <dl className="mt-5 space-y-3 text-ink-2">
                  <div className="flex items-center gap-3">
                    <ClockIcon size={20} className="text-ink-3" />
                    <dt className="sr-only">{t("checkIn")}</dt>
                    <dd>{t("checkInFrom", { time: property.checkInTime })}</dd>
                  </div>
                  <div className="flex items-center gap-3">
                    <ClockIcon size={20} className="text-ink-3" />
                    <dt className="sr-only">{t("checkOut")}</dt>
                    <dd>{t("checkOutUntil", { time: property.checkOutTime })}</dd>
                  </div>
                </dl>
              </div>
              {rules.length ? (
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">{t("rules")}</h2>
                  <ul className="mt-5 space-y-2.5 text-ink-2">
                    {rules.map((rule) => (
                      <li key={rule} className="flex gap-3">
                        <span aria-hidden className="mt-2.5 size-1 shrink-0 rounded-full bg-ink-3" />
                        {rule}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            {cancellation ? (
              <section className="border-b border-line py-10">
                <h2 className="text-xl font-semibold tracking-tight">{t("cancellation")}</h2>
                <p className="mt-5 max-w-[68ch] leading-relaxed whitespace-pre-line text-ink-2">{cancellation}</p>
                <Link href="/terminos" className="mt-4 inline-block text-sm font-medium text-accent-text underline underline-offset-4">
                  {t("readTerms")}
                </Link>
              </section>
            ) : null}

            {property.latitude !== null && property.longitude !== null ? (
              <section className="border-b border-line py-10">
                <h2 className="text-xl font-semibold tracking-tight">{t("location")}</h2>
                <p className="mt-1.5 mb-6 text-sm text-ink-3">
                  {property.city}, {property.region}. {t("locationPrivacy")}
                </p>
                <LocationMap latitude={property.latitude} longitude={property.longitude} label={t("mapLabel", { city: property.city })} />
              </section>
            ) : null}

            <section className="py-10">
              <div className="flex flex-col gap-6 rounded-3xl bg-surface-2 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{t("contactTitle", { agency: agency.name })}</h2>
                  <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-3">{t("contactBody")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {agency.whatsapp ? (
                    <a
                      href={whatsappUrl(agency.whatsapp, t("whatsappMessage", { title: property.title }))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonClasses({ variant: "secondary" })}
                    >
                      <WhatsappLogoIcon size={18} />
                      WhatsApp
                    </a>
                  ) : null}
                  {agency.email ? (
                    <a href={`mailto:${agency.email}?subject=${encodeURIComponent(property.title)}`} className={buttonClasses({ variant: "secondary" })}>
                      <EnvelopeSimpleIcon size={18} />
                      Email
                    </a>
                  ) : null}
                </div>
              </div>
            </section>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <BookingWidget />
            </div>
          </aside>
        </div>
      </div>
      <MobileBookingBar />
    </BookingStateProvider>
  );
}
