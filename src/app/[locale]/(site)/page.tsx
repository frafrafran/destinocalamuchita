import {
  ArrowRightIcon,
  CalendarCheckIcon,
  ChatsCircleIcon,
  CheckCircleIcon,
  FileArrowUpIcon,
  HandCoinsIcon,
  IdentificationCardIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  StarIcon,
  UserCircleIcon,
} from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ValleyHero, type ValleyLayers } from "@/components/home/valley-hero";
import { HeroIntro, Reveal } from "@/components/motion/reveal";
import { Parallax, ScrollDrawLine } from "@/components/motion/scroll";
import { PropertyCard } from "@/components/property/property-card";
import { Ridge } from "@/components/scenery/ridge";
import { HeroSearch } from "@/components/search/hero-search";
import { buttonClasses } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { todayISO } from "@/lib/dates";
import { getHomeData } from "@/server/queries/public";
import { alternatesFor, jsonLd, localizedUrl } from "@/server/seo";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

/** Ridge line of the closing call to action; the lower one takes the footer colour. */
const CLOSING_LAYERS = {
  far: (
    <Ridge
      className="size-full"
      options={{ seed: 91, height: 360, base: 200, amplitude: 150, frequency: 2.2, treeline: 26 }}
      fill={{ id: "closing-far", top: "rgba(12, 19, 16, 0.6)", bottom: "rgba(12, 19, 16, 0.92)" }}
    />
  ),
  ground: <Ridge className="size-full" options={{ seed: 97, height: 260, base: 150, amplitude: 150, roughness: 0.3, frequency: 1.5 }} fill="var(--surface)" />,
};

/** Vertical drift (px) of each destination column on desktop: alternating speeds read as depth. */
const DESTINATION_DRIFT = [70, -40, 110, -20, 85, -55];

/** Silhouettes of the hero scene (Sierras Grandes behind, wooded hills in front). Fixed seeds keep them stable. */
const VALLEY_LAYERS: ValleyLayers = {
  mid: (
    <Ridge
      className="size-full"
      options={{ seed: 11, height: 420, base: 200, amplitude: 300, roughness: 0.55, frequency: 2.4, treeline: 12 }}
      fill={{ id: "valley-mid", top: "rgba(44, 58, 54, 0.9)", bottom: "var(--scene-ink)" }}
    />
  ),
  left: (
    <Ridge
      className="size-full"
      anchor="left"
      options={{ seed: 27, height: 520, base: 250, amplitude: 70, frequency: 2.6, envelope: "left", treeline: 38 }}
      fill="var(--scene-ink)"
    />
  ),
  right: (
    <Ridge
      className="size-full"
      anchor="right"
      options={{ seed: 43, height: 460, base: 215, amplitude: 60, frequency: 2.4, envelope: "right", treeline: 32 }}
      fill="var(--scene-ink)"
    />
  ),
  near: <Ridge className="size-full" options={{ seed: 58, height: 360, base: 185, amplitude: 110, frequency: 2, treeline: 30 }} fill="var(--scene-ink)" />,
  ground: <Ridge className="size-full" options={{ seed: 72, height: 280, base: 200, amplitude: 150, roughness: 0.3, frequency: 1.3 }} fill="var(--bg)" />,
};

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const [t, settings] = await Promise.all([getTranslations({ locale, namespace: "meta" }), getSettings()]);
  return {
    title: { absolute: t("title", { name: settings.agency.name }) },
    description: t("description"),
    alternates: alternatesFor(locale as Locale, "/"),
    openGraph: { images: settings.site.heroImageUrl ? [{ url: settings.site.heroImageUrl, width: 2000, height: 1334 }] : undefined },
  };
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [t, data, settings] = await Promise.all([getTranslations("home"), getHomeData(locale), getSettings()]);
  const heroImage = settings.site.heroImageUrl || data.featured[0]?.images[0]?.url;
  const ctaImage = settings.site.ctaImageUrl || data.recommended[0]?.images[0]?.url;
  const testimonials = settings.testimonials.items.filter((item) => item.quote[locale]);
  const agency = settings.agency;

  const organization = {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: agency.name,
    legalName: agency.legalName || undefined,
    url: localizedUrl(locale, "/"),
    email: agency.email || undefined,
    telephone: agency.phone || undefined,
    image: heroImage,
    address: agency.address
      ? { "@type": "PostalAddress", streetAddress: agency.address, addressLocality: agency.city, addressCountry: "AR" }
      : undefined,
    areaServed: data.cities.map((city) => ({ "@type": "City", name: city })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(organization)} />

      {/* Hero: pinned scroll scene into the valley */}
      <ValleyHero
        photo={
          heroImage ? (
            <Image src={heroImage} alt="" fill priority sizes="100vw" className="object-cover" quality={75} />
          ) : (
            <div className="size-full bg-[linear-gradient(to_bottom,#6f8f95,#c9b79a)]" />
          )
        }
        layers={VALLEY_LAYERS}
        statement={t("hero.statement")}
        scrollHint={t("hero.scrollHint")}
        intro={
          <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-10">
            <HeroIntro className="max-w-3xl">
              <h1 className="text-[2.6rem] leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-6xl lg:text-7xl">{t("hero.title")}</h1>
            </HeroIntro>
            <HeroIntro delay={0.12} className="mt-5 max-w-xl">
              <p className="text-base leading-relaxed text-white/85 sm:text-lg">{t("hero.subtitle")}</p>
            </HeroIntro>
            <HeroIntro delay={0.24} className="mt-8 max-w-4xl md:mt-10">
              <HeroSearch cities={data.cities} today={todayISO()} />
            </HeroIntro>
          </div>
        }
      />

      {/* Featured: asymmetric trio */}
      {data.featured.length > 0 ? (
        <section className="mx-auto max-w-[1400px] px-4 pt-10 pb-24 sm:px-6 md:pt-14 md:pb-32 lg:px-10">
          <Reveal className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{t("featured.title")}</h2>
              <p className="mt-3 text-ink-3">{t("featured.subtitle")}</p>
            </div>
            <Link href="/propiedades" className="group inline-flex items-center gap-2 text-sm font-medium text-accent-text">
              {t("viewProperties")}
              <ArrowRightIcon size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
          <div className="mt-12 grid gap-x-8 gap-y-12 md:grid-cols-12">
            {data.featured.map((property, index) => (
              <Reveal
                key={property.id}
                delay={index * 0.08}
                className={index === 0 ? "md:col-span-7 md:row-span-2" : "md:col-span-5"}
              >
                <PropertyCard
                  property={property}
                  locale={locale}
                  aspect={index === 0 ? "portrait" : "wide"}
                  sizes={index === 0 ? "(min-width: 768px) 58vw, 100vw" : "(min-width: 768px) 40vw, 100vw"}
                />
              </Reveal>
            ))}
          </div>
        </section>
      ) : null}

      {/* Destinations: horizontal rail */}
      {data.destinations.length > 0 ? (
        <section id="destinos" className="scroll-mt-20 border-y border-line bg-surface py-24 md:py-28">
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10">
            <Reveal className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{t("destinations.title")}</h2>
              <p className="mt-3 text-ink-3">{t("destinations.subtitle")}</p>
            </Reveal>
          </div>
          {/* Phones: swipeable rail. Desktop: columns that drift at different speeds (depth, like a valley seen in layers). */}
          <ul className="scrollbar-none mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-px-4 px-4 pb-2 sm:scroll-px-6 sm:px-6 lg:mx-auto lg:grid lg:max-w-[1400px] lg:snap-none lg:grid-cols-[repeat(auto-fit,minmax(0,1fr))] lg:gap-6 lg:overflow-visible lg:px-10 lg:pt-10 lg:pb-16">
            {data.destinations.map((destination, index) => (
              <Reveal as="li" key={destination.city} delay={index * 0.05} className="w-[72vw] shrink-0 snap-start sm:w-[320px] lg:w-auto lg:even:mt-20">
                <Parallax from={DESTINATION_DRIFT[index % DESTINATION_DRIFT.length]!} to={-DESTINATION_DRIFT[index % DESTINATION_DRIFT.length]!} enabledQuery="(min-width: 1024px)">
                <Link href={`/propiedades?city=${encodeURIComponent(destination.city)}`} className="group block">
                  <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-surface-2">
                    {destination.image ? (
                      <Image
                        src={destination.image.url}
                        alt={destination.city}
                        fill
                        sizes="(min-width: 1024px) 20vw, (min-width: 640px) 320px, 72vw"
                        className="object-cover transition-transform duration-[900ms] ease-(--ease-soft) group-hover:scale-[1.05]"
                      />
                    ) : null}
                  </div>
                  <p className="mt-4 text-lg font-semibold tracking-tight">{destination.city}</p>
                  <p className="text-sm text-ink-3">{t("destinations.count", { count: destination.count })}</p>
                </Link>
                </Parallax>
              </Reveal>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Why book direct: statement + list */}
      <section className="mx-auto grid max-w-[1400px] gap-14 px-4 py-24 sm:px-6 md:py-32 lg:grid-cols-[1fr_1.2fr] lg:gap-24 lg:px-10">
        <Reveal>
          <h2 className="max-w-md text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">{t("benefits.title")}</h2>
          <p className="mt-4 max-w-md leading-relaxed text-ink-3">{t("benefits.subtitle")}</p>
        </Reveal>
        <ul className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {(
            [
              ["noFees", HandCoinsIcon],
              ["personal", ChatsCircleIcon],
              ["clearPrice", ReceiptIcon],
              ["synced", CalendarCheckIcon],
            ] as const
          ).map(([key, Icon], index) => (
            <Reveal as="li" key={key} delay={index * 0.06} className="border-t border-line pt-6">
              <Icon size={26} className="text-accent-text" />
              <h3 className="mt-4 font-semibold tracking-tight">{t(`benefits.${key}.title`)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{t(`benefits.${key}.body`)}</p>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* How to book: timeline */}
      <section id="como-reservar" className="scroll-mt-20 bg-accent-soft/60 py-24 md:py-28">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10">
          <Reveal className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{t("process.title")}</h2>
            <p className="mt-3 text-ink-2">{t("process.subtitle")}</p>
          </Reveal>
          <div className="relative mt-14">
          <ScrollDrawLine className="absolute top-6 right-[12%] left-[12%] hidden h-px bg-accent/45 md:block" />
          <ol className="grid gap-10 md:grid-cols-4 md:gap-8">
            {(
              [
                ["dates", CalendarCheckIcon],
                ["details", IdentificationCardIcon],
                ["transfer", FileArrowUpIcon],
                ["confirmed", CheckCircleIcon],
              ] as const
            ).map(([key, Icon], index) => (
              <Reveal as="li" key={key} delay={index * 0.08} className="relative flex gap-5 md:flex-col md:gap-6">
                <span className="relative z-10 grid size-12 shrink-0 place-items-center rounded-full bg-surface text-accent-text shadow-soft">
                  <Icon size={22} />
                </span>
                <div>
                  <h3 className="font-semibold tracking-tight">{t(`process.${key}.title`)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{t(`process.${key}.body`)}</p>
                </div>
              </Reveal>
            ))}
          </ol>
          </div>
        </div>
      </section>

      {/* New arrivals: card grid */}
      {data.newest.length > 0 ? (
        <section className="mx-auto max-w-[1400px] px-4 py-24 sm:px-6 md:py-32 lg:px-10">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{t("newest.title")}</h2>
            <p className="mt-3 text-ink-3">{t("newest.subtitle")}</p>
          </Reveal>
          <div className="mt-12 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {data.newest.map((property, index) => (
              <Reveal key={property.id} delay={index * 0.06}>
                <PropertyCard property={property} locale={locale} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" />
              </Reveal>
            ))}
          </div>
        </section>
      ) : null}

      {/* Most loved: large image + ranked list */}
      {data.recommended.length > 0 ? (
        <section className="border-t border-line bg-surface">
          <div className="mx-auto grid max-w-[1400px] gap-12 px-4 py-24 sm:px-6 md:py-28 lg:grid-cols-[1.25fr_1fr] lg:items-center lg:gap-20 lg:px-10">
            <Reveal>
              <Link href={`/propiedades/${data.recommended[0]!.slug}`} className="group block">
                <div className="relative aspect-[5/4] overflow-hidden rounded-3xl bg-surface-2">
                  {data.recommended[0]!.images[0] ? (
                    <Image
                      src={data.recommended[0]!.images[0].url}
                      alt={data.recommended[0]!.images[0].alt}
                      fill
                      sizes="(min-width: 1024px) 55vw, 100vw"
                      className="object-cover transition-transform duration-[900ms] ease-(--ease-soft) group-hover:scale-[1.03]"
                    />
                  ) : null}
                </div>
              </Link>
            </Reveal>
            <div>
              <Reveal>
                <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{t("recommended.title")}</h2>
                <p className="mt-3 text-ink-3">{t("recommended.subtitle")}</p>
              </Reveal>
              <ol className="mt-10 divide-y divide-line">
                {data.recommended.map((property, index) => (
                  <Reveal as="li" key={property.id} delay={index * 0.06}>
                    <Link href={`/propiedades/${property.slug}`} className="group flex items-center gap-5 py-5">
                      <span className="tabular w-6 text-sm text-ink-3">{index + 1}</span>
                      <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                        {property.images[0] ? <Image src={property.images[0].url} alt="" fill sizes="64px" className="object-cover" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold tracking-tight group-hover:underline group-hover:underline-offset-4">{property.title}</p>
                        <p className="truncate text-sm text-ink-3">{property.city}</p>
                      </div>
                      {property.ratingAverage ? (
                        <span className="tabular flex items-center gap-1 text-sm font-medium">
                          <StarIcon size={14} weight="fill" />
                          {new Intl.NumberFormat(locale, { minimumFractionDigits: 2 }).format(property.ratingAverage)}
                        </span>
                      ) : null}
                    </Link>
                  </Reveal>
                ))}
              </ol>
            </div>
          </div>
        </section>
      ) : null}

      {/* Testimonials */}
      {testimonials.length > 0 ? (
        <section className="mx-auto max-w-[1400px] px-4 py-24 sm:px-6 md:py-32 lg:px-10">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{t("testimonials.title")}</h2>
          </Reveal>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {testimonials.slice(0, 3).map((item, index) => (
              <Reveal
                key={item.name}
                delay={index * 0.08}
                className={index === 0 ? "rounded-3xl bg-accent p-8 text-accent-ink lg:row-span-2 lg:p-10" : "rounded-3xl bg-surface p-8 shadow-hairline"}
              >
                <figure className="flex h-full flex-col justify-between gap-8">
                  <blockquote className={index === 0 ? "text-2xl leading-snug font-medium tracking-tight" : "text-lg leading-relaxed"}>
                    “{item.quote[locale]}”
                  </blockquote>
                  <figcaption className="flex items-center gap-3 text-sm">
                    <UserCircleIcon size={32} weight="light" className={index === 0 ? "opacity-80" : "text-ink-3"} />
                    <span>
                      <span className="block font-semibold">{item.name}</span>
                      {item.origin ? <span className={index === 0 ? "opacity-75" : "text-ink-3"}>{item.origin}</span> : null}
                    </span>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </section>
      ) : null}

      {/* Trust */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-[1400px] gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_2fr] lg:gap-20 lg:px-10">
          <Reveal>
            <ShieldCheckIcon size={32} className="text-accent-text" />
            <h2 className="mt-5 text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">{t("trust.title")}</h2>
            <p className="mt-3 leading-relaxed text-ink-3">{t("trust.body")}</p>
          </Reveal>
          <div className="grid gap-8 sm:grid-cols-3">
            {(["code", "receipt", "policy"] as const).map((key, index) => (
              <Reveal key={key} delay={index * 0.06}>
                <p className="font-semibold tracking-tight">{t(`trust.${key}.title`)}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{t(`trust.${key}.body`)}</p>
              </Reveal>
            ))}
            {agency.legalName || agency.taxId ? (
              <p className="text-xs text-ink-3 sm:col-span-3">
                {[agency.legalName, agency.taxId ? `CUIT ${agency.taxId}` : null, agency.address ? `${agency.address}, ${agency.city}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* Final CTA: the photo settles as it scrolls in, and a ridge line closes the page into the footer. */}
      <section className="relative isolate z-10 -mb-px overflow-hidden bg-(--scene-ink) text-white">
        {ctaImage ? (
          <Parallax className="absolute inset-0 -z-10" from={-40} to={40} scale={[1.16, 1.06]}>
            <Image src={ctaImage} alt="" fill sizes="100vw" className="object-cover" />
          </Parallax>
        ) : null}
        <div aria-hidden className="absolute inset-0 -z-10 bg-black/45" />
        <Parallax className="pointer-events-none absolute inset-x-0 bottom-0 h-[30svh]" from={45} to={-15}>
          {CLOSING_LAYERS.far}
        </Parallax>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-px h-[16svh]">
          {CLOSING_LAYERS.ground}
        </div>
        <div className="relative mx-auto flex max-w-[1400px] flex-col items-start gap-8 px-4 pt-28 pb-[26svh] sm:px-6 md:pt-40 lg:px-10">
          <Reveal>
            <h2 className="max-w-2xl text-4xl leading-[1.05] font-semibold tracking-[-0.035em] text-balance sm:text-5xl">{t("cta.title")}</h2>
          </Reveal>
          <Reveal delay={0.1}>
            <Link href="/propiedades" className={buttonClasses({ variant: "inverse", size: "lg" })}>
              {t("viewProperties")}
              <ArrowRightIcon size={18} />
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
