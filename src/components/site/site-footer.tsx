import { EnvelopeSimpleIcon, InstagramLogoIcon, MapPinIcon, PhoneIcon, WhatsappLogoIcon } from "@phosphor-icons/react/ssr";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Settings } from "@/server/settings";
import { whatsappUrl } from "@/lib/contact";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export async function SiteFooter({ agency }: { agency: Settings["agency"] }) {
  const t = await getTranslations("footer");
  const nav = await getTranslations("nav");
  const year = new Date().getFullYear();

  const columns = [
    {
      title: t("explore"),
      links: [
        { href: "/propiedades", label: nav("properties") },
        { href: "/#destinos", label: nav("destinations") },
        { href: "/#como-reservar", label: nav("howItWorks") },
      ],
    },
    {
      title: t("help"),
      links: [
        { href: "/reserva", label: nav("myBooking") },
        { href: "/contacto", label: nav("contact") },
        { href: "/cancelaciones", label: t("cancellation") },
      ],
    },
    {
      title: t("legal"),
      links: [
        { href: "/terminos", label: t("terms") },
        { href: "/privacidad", label: t("privacy") },
      ],
    },
  ];

  return (
    <footer className="border-t border-line bg-surface print:hidden">
      <div className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_2fr]">
          <div className="max-w-sm">
            <Logo name={agency.name} />
            <p className="mt-4 text-sm leading-relaxed text-ink-3">{t("tagline")}</p>
            <ul className="mt-6 space-y-2.5 text-sm text-ink-2">
              {agency.email ? (
                <li>
                  <a href={`mailto:${agency.email}`} className="inline-flex items-center gap-2.5 hover:text-ink">
                    <EnvelopeSimpleIcon size={16} className="text-ink-3" />
                    {agency.email}
                  </a>
                </li>
              ) : null}
              {agency.whatsapp ? (
                <li>
                  <a href={whatsappUrl(agency.whatsapp)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2.5 hover:text-ink">
                    <WhatsappLogoIcon size={16} className="text-ink-3" />
                    {agency.whatsapp}
                  </a>
                </li>
              ) : agency.phone ? (
                <li className="inline-flex items-center gap-2.5">
                  <PhoneIcon size={16} className="text-ink-3" />
                  {agency.phone}
                </li>
              ) : null}
              {agency.address ? (
                <li className="flex items-start gap-2.5">
                  <MapPinIcon size={16} className="mt-0.5 shrink-0 text-ink-3" />
                  <span>
                    {agency.address}
                    {agency.city ? `, ${agency.city}` : ""}
                  </span>
                </li>
              ) : null}
              {agency.instagram ? (
                <li>
                  <a
                    href={`https://instagram.com/${agency.instagram.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2.5 hover:text-ink"
                  >
                    <InstagramLogoIcon size={16} className="text-ink-3" />
                    {agency.instagram}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {columns.map((column) => (
              <div key={column.title}>
                <p className="text-sm font-semibold text-ink">{column.title}</p>
                <ul className="mt-4 space-y-3">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-sm text-ink-3 transition-colors hover:text-ink">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-14 flex flex-col-reverse gap-4 border-t border-line pt-6 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {agency.legalName || agency.name}
            {agency.taxId ? ` · CUIT ${agency.taxId}` : ""}
          </p>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
