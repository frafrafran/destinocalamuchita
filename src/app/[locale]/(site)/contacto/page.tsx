import { EnvelopeSimpleIcon, InstagramLogoIcon, MapPinIcon, PhoneIcon, WhatsappLogoIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buttonClasses } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { whatsappUrl } from "@/lib/contact";
import { alternatesFor } from "@/server/seo";
import { getSettings } from "@/server/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/contacto">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
  return { title: t("title"), description: t("subtitle"), alternates: alternatesFor(locale as Locale, "/contacto") };
}

export default async function ContactPage({ params }: PageProps<"/[locale]/contacto">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, settings] = await Promise.all([getTranslations("contact"), getSettings()]);
  const agency = settings.agency;
  const channels = [
    agency.whatsapp ? { icon: WhatsappLogoIcon, label: "WhatsApp", value: agency.whatsapp, href: whatsappUrl(agency.whatsapp, t("whatsappMessage")), external: true } : null,
    agency.email ? { icon: EnvelopeSimpleIcon, label: t("email"), value: agency.email, href: `mailto:${agency.email}`, external: false } : null,
    agency.phone && agency.phone !== agency.whatsapp ? { icon: PhoneIcon, label: t("phone"), value: agency.phone, href: `tel:${agency.phone.replace(/[^\d+]/g, "")}`, external: false } : null,
    agency.instagram ? { icon: InstagramLogoIcon, label: "Instagram", value: agency.instagram, href: `https://instagram.com/${agency.instagram.replace(/^@/, "")}`, external: true } : null,
  ].filter((channel) => channel !== null);

  return (
    <div className="mx-auto grid max-w-6xl gap-14 px-4 pt-[120px] pb-24 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-20 lg:px-10">
      <div>
        <h1 className="text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">{t("title")}</h1>
        <p className="mt-4 max-w-md text-lg leading-relaxed text-ink-3">{t("subtitle")}</p>
        {agency.address ? (
          <p className="mt-10 flex items-start gap-3 text-ink-2">
            <MapPinIcon size={20} className="mt-0.5 shrink-0 text-ink-3" />
            <span>
              {agency.address}
              {agency.city ? <span className="block text-ink-3">{agency.city}</span> : null}
            </span>
          </p>
        ) : null}
        <p className="mt-6 text-sm text-ink-3">{t("hours")}</p>
        <Link href="/reserva" className={buttonClasses({ variant: "secondary", className: "mt-10" })}>
          {t("haveBooking")}
        </Link>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {channels.map((channel) => (
          <li key={channel.label}>
            <a
              href={channel.href}
              target={channel.external ? "_blank" : undefined}
              rel={channel.external ? "noopener noreferrer" : undefined}
              className="group flex h-full flex-col justify-between gap-10 rounded-3xl border border-line bg-surface p-6 shadow-hairline transition-shadow hover:shadow-soft"
            >
              <channel.icon size={28} className="text-accent-text" />
              <span>
                <span className="block text-sm text-ink-3">{channel.label}</span>
                <span className="mt-1 block font-semibold tracking-tight break-all group-hover:underline group-hover:underline-offset-4">{channel.value}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
