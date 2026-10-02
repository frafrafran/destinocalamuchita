import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookingFlow } from "@/components/booking/booking-flow";
import type { Locale } from "@/i18n/config";
import { isValidISODate } from "@/lib/dates";
import { PUBLIC_CALENDAR_DAYS, getPublicProperty } from "@/server/queries/public";
import { DemoWarning } from "@/components/site/demo-notice";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/reservar/[slug]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "booking.flow" });
  // Checkout pages carry personal choices: keep them out of search engines.
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function ReservePage({ params, searchParams }: PageProps<"/[locale]/reservar/[slug]">) {
  const { locale: raw, slug } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const query = await searchParams;
  const [property, settings] = await Promise.all([getPublicProperty(slug, locale), getSettings()]);
  if (!property) notFound();

  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const checkIn = first(query.checkIn);
  const checkOut = first(query.checkOut);
  const cancellation = property.cancellationPolicy || settings.policies.cancellation[locale] || settings.policies.cancellation.es;

  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-[100px] pb-24 sm:px-6 lg:px-10">
      <DemoWarning className="mb-8" />
      <BookingFlow
        property={{
          slug: property.slug,
          title: property.title,
          city: property.city,
          image: property.images[0] ? { url: property.images[0].url, alt: property.images[0].alt } : null,
          checkInTime: property.checkInTime,
          checkOutTime: property.checkOutTime,
        }}
        pricing={property.pricing}
        blocked={property.blocked}
        today={property.today}
        horizonDays={PUBLIC_CALENDAR_DAYS}
        initial={{
          checkIn: isValidISODate(checkIn) ? checkIn : undefined,
          checkOut: isValidISODate(checkOut) ? checkOut : undefined,
          guests: Number(first(query.guests)) || undefined,
        }}
        cancellationSummary={cancellation.split("\n")[0] ?? ""}
      />
    </div>
  );
}
