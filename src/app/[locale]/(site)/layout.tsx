import { getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getSettings } from "@/server/settings";

export default async function SiteLayout({ children }: LayoutProps<"/[locale]">) {
  const [settings, t] = await Promise.all([getSettings(), getTranslations("common")]);
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-accent px-4 py-2 text-accent-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t("skipToContent")}
      </a>
      <SiteHeader agencyName={settings.agency.name} />
      <main id="main" className="min-h-dvh">
        {children}
      </main>
      <SiteFooter agency={settings.agency} />
    </>
  );
}
