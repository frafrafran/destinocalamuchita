import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/site/legal-page";
import type { Locale } from "@/i18n/config";
import { alternatesFor } from "@/server/seo";
import { getSettings } from "@/server/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/terminos">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("termsTitle"), alternates: alternatesFor(locale as Locale, "/terminos") };
}

export default async function TermsPage({ params }: PageProps<"/[locale]/terminos">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [t, settings] = await Promise.all([getTranslations("legal"), getSettings()]);
  const body = settings.policies.terms[locale] || settings.policies.terms.es || t("empty");
  const agency = settings.agency;
  return (
    <LegalPage
      title={t("termsTitle")}
      body={body}
      aside={
        <>
          <p className="font-semibold text-ink">{agency.legalName || agency.name}</p>
          {agency.taxId ? <p>CUIT {agency.taxId}</p> : null}
          {agency.address ? <p>{[agency.address, agency.city].filter(Boolean).join(", ")}</p> : null}
          {agency.email ? <p className="mt-2">{agency.email}</p> : null}
        </>
      }
    />
  );
}
