import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/site/legal-page";
import type { Locale } from "@/i18n/config";
import { alternatesFor } from "@/server/seo";
import { getSettings } from "@/server/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/cancelaciones">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("cancellationTitle"), alternates: alternatesFor(locale as Locale, "/cancelaciones") };
}

export default async function CancellationPage({ params }: PageProps<"/[locale]/cancelaciones">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [t, settings] = await Promise.all([getTranslations("legal"), getSettings()]);
  const body = settings.policies.cancellation[locale] || settings.policies.cancellation.es || t("empty");
  return <LegalPage title={t("cancellationTitle")} body={body} aside={<p>{t("cancellationAside")}</p>} />;
}
