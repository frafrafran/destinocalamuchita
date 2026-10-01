import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { InfoStep } from "@/components/admin/property/info-step";
import { PropertySteps } from "@/components/admin/property/property-steps";
import { PageHeader } from "@/components/admin/ui";
import { Link } from "@/i18n/navigation";
import { requirePageUser } from "@/server/auth/guard";
import { listOwnerOptions } from "@/server/queries/properties";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/propiedades/nueva">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.property" });
  return { title: t("newTitle") };
}

export default async function NewPropertyPage({ params }: PageProps<"/[locale]/admin/propiedades/nueva">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePageUser("properties:write");
  const [t, owners] = await Promise.all([getTranslations("admin.property"), listOwnerOptions()]);
  return (
    <>
      <PageHeader
        back={
          <Link href="/admin/propiedades" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
            <ArrowLeftIcon size={14} />
            {t("back")}
          </Link>
        }
        title={t("newTitle")}
        description={t("newSubtitle")}
      />
      <div className="mb-8">
        <PropertySteps propertyId={null} current="info" done={{}} />
      </div>
      <InfoStep
        propertyId={null}
        canEditOwner
        owners={owners}
        initial={{
          title: "",
          slug: "",
          type: "HOUSE",
          summary: "",
          description: "",
          city: "",
          region: "Córdoba",
          address: "",
          postalCode: "",
          latitude: "",
          longitude: "",
          maxGuests: "4",
          bedrooms: "2",
          beds: "2",
          bathrooms: "1",
          areaM2: "",
          ownerId: "",
          videoUrl: "",
          featured: false,
          ratingAverage: "",
          ratingCount: "",
        }}
        translations={{ en: { title: "", summary: "", description: "" }, pt: { title: "", summary: "", description: "" } }}
      />
    </>
  );
}
