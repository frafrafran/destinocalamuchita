import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/site/legal-page";
import type { Locale } from "@/i18n/config";
import { alternatesFor } from "@/server/seo";
import { getSettings } from "@/server/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/privacidad">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("privacyTitle"), alternates: alternatesFor(locale as Locale, "/privacidad") };
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacidad">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, settings] = await Promise.all([getTranslations("legal"), getSettings()]);
  const agency = settings.agency;
  return (
    <LegalPage
      title={t("privacyTitle")}
      body={t("privacyBody", { agency: agency.legalName || agency.name, email: agency.email || "-" })}
    />
  );
}
