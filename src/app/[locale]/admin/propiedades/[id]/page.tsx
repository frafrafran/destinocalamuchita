import { ArrowLeftIcon, ArrowSquareOutIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AmenitiesStep } from "@/components/admin/property/amenities-step";
import { ChannelsStep } from "@/components/admin/property/channels-step";
import { InfoStep } from "@/components/admin/property/info-step";
import { PhotosStep } from "@/components/admin/property/photos-step";
import { PricingStep, type RuleRow } from "@/components/admin/property/pricing-step";
import { PropertySteps } from "@/components/admin/property/property-steps";
import { PROPERTY_STEPS, type PropertyStep } from "@/components/admin/property/steps";
import { PublishStep } from "@/components/admin/property/publish-step";
import { RulesStep } from "@/components/admin/property/rules-step";
import { PageHeader } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { addDays, fromDbDate } from "@/lib/dates";
import { centsToInput, toCents } from "@/lib/money";
import { requirePageUser } from "@/server/auth/guard";
import { can } from "@/server/auth/permissions";
import { toPricingConfig } from "@/server/booking/pricing-config";
import { getPropertyEditor } from "@/server/queries/properties";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/propiedades/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.nav" });
  return { title: t("properties") };
}

const money = (value: { toString(): string } | null) => (value === null ? "" : centsToInput(toCents(value)));

export default async function PropertyEditorPage({ params, searchParams }: PageProps<"/[locale]/admin/propiedades/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requirePageUser("properties:read");
  const query = await searchParams;
  const step = (PROPERTY_STEPS as readonly string[]).includes(String(query.paso)) ? (query.paso as PropertyStep) : "info";
  const [data, t, tStatus] = await Promise.all([getPropertyEditor(user, id), getTranslations("admin.property"), getTranslations("status.property")]);
  if (!data) notFound();
  const { property, amenities, owners, checklist, exportUrl } = data;
  const canWrite = can(user.role, "properties:write");
  const translation = (locale: "en" | "pt") => property.translations.find((row) => row.locale === locale);

  const done: Partial<Record<PropertyStep, boolean>> = {
    info: checklist.description && checklist.location,
    fotos: checklist.photos,
    servicios: property.amenities.length > 0,
    precios: checklist.price,
    reglas: Boolean(property.houseRules || property.arrivalInstructions),
    canales: property.calendarIntegrations.length > 0,
    publicar: property.status === "PUBLISHED",
  };

  const rules: RuleRow[] = property.priceRules.flatMap((rule): RuleRow[] => {
    if (rule.type === "SPECIAL_DATE" && rule.startDate && rule.endDate) {
      return [{ id: rule.id, type: "SPECIAL_DATE", name: rule.name, startDate: fromDbDate(rule.startDate), lastDate: addDays(fromDbDate(rule.endDate), -1), amount: money(rule.amount) }];
    }
    if (rule.type === "LENGTH_DISCOUNT") return [{ id: rule.id, type: "LENGTH_DISCOUNT", name: rule.name, minNights: String(rule.minNights ?? ""), percent: String(Number(rule.percent ?? 0)) }];
    if (rule.type === "FEE" && rule.feeUnit) return [{ id: rule.id, type: "FEE", name: rule.name, amount: money(rule.amount), feeUnit: rule.feeUnit }];
    return [];
  });

  return (
    <>
      <PageHeader
        back={
          <Link href="/admin/propiedades" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
            <ArrowLeftIcon size={14} />
            {t("back")}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {property.title}
            <Badge tone={property.status === "PUBLISHED" ? "success" : property.status === "PAUSED" ? "warning" : "neutral"}>{tStatus(property.status)}</Badge>
          </span>
        }
        description={t("editorSubtitle")}
        actions={
          property.status === "PUBLISHED" ? (
            <Link href={`/propiedades/${property.slug}`} target="_blank" className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-accent-text hover:bg-accent-soft">
              <ArrowSquareOutIcon size={16} />
              {t("viewOnSite")}
            </Link>
          ) : null
        }
      />
      <div className="mb-8">
        <PropertySteps propertyId={property.id} current={step} done={done} />
      </div>
      <fieldset disabled={!canWrite} className="contents">
        {step === "info" ? (
          <InfoStep
            propertyId={property.id}
            canEditOwner={user.role !== "OWNER"}
            owners={owners}
            initial={{
              title: property.title,
              slug: property.slug,
              type: property.type,
              summary: property.summary,
              description: property.description,
              city: property.city,
              region: property.region,
              address: property.address,
              postalCode: property.postalCode ?? "",
              latitude: property.latitude?.toString() ?? "",
              longitude: property.longitude?.toString() ?? "",
              maxGuests: String(property.maxGuests),
              bedrooms: String(property.bedrooms),
              beds: String(property.beds),
              bathrooms: String(Number(property.bathrooms)),
              areaM2: property.areaM2 ? String(property.areaM2) : "",
              ownerId: property.ownerId ?? "",
              videoUrl: property.videoUrl ?? "",
              featured: property.featured,
              ratingAverage: property.ratingAverage?.toString() ?? "",
              ratingCount: property.ratingCount ? String(property.ratingCount) : "",
            }}
            translations={{
              en: { title: translation("en")?.title ?? "", summary: translation("en")?.summary ?? "", description: translation("en")?.description ?? "" },
              pt: { title: translation("pt")?.title ?? "", summary: translation("pt")?.summary ?? "", description: translation("pt")?.description ?? "" },
            }}
          />
        ) : null}
        {step === "fotos" ? (
          <PhotosStep propertyId={property.id} images={property.images.map(({ id, url, alt, width, height }) => ({ id, url, alt, width, height }))} />
        ) : null}
        {step === "servicios" ? (
          <AmenitiesStep
            propertyId={property.id}
            amenities={amenities.map(({ id, key, label, icon, category }) => ({ id, key, label, icon, category }))}
            selected={property.amenities.map((row) => row.amenityId)}
          />
        ) : null}
        {step === "precios" ? (
          <PricingStep
            propertyId={property.id}
            base={{
              currency: property.currency,
              basePrice: money(property.basePrice),
              weekendPrice: money(property.weekendPrice),
              cleaningFee: money(property.cleaningFee),
              minNights: String(property.minNights),
              maxNights: property.maxNights ? String(property.maxNights) : "",
            }}
            seasons={property.seasons.map((season) => ({
              id: season.id,
              name: season.name,
              startDate: fromDbDate(season.startDate),
              lastDate: addDays(fromDbDate(season.endDate), -1),
              nightlyPrice: money(season.nightlyPrice),
              weekendPrice: money(season.weekendPrice),
              minNights: season.minNights ? String(season.minNights) : "",
            }))}
            rules={rules}
            config={toPricingConfig(property, property.seasons, property.priceRules)}
          />
        ) : null}
        {step === "reglas" ? (
          <RulesStep
            propertyId={property.id}
            initial={{
              checkInTime: property.checkInTime,
              checkOutTime: property.checkOutTime,
              houseRules: property.houseRules,
              arrivalInstructions: property.arrivalInstructions,
              cancellationPolicy: property.cancellationPolicy,
            }}
            translations={{
              en: {
                houseRules: translation("en")?.houseRules ?? "",
                arrivalInstructions: translation("en")?.arrivalInstructions ?? "",
                cancellationPolicy: translation("en")?.cancellationPolicy ?? "",
              },
              pt: {
                houseRules: translation("pt")?.houseRules ?? "",
                arrivalInstructions: translation("pt")?.arrivalInstructions ?? "",
                cancellationPolicy: translation("pt")?.cancellationPolicy ?? "",
              },
            }}
          />
        ) : null}
        {step === "canales" ? (
          <ChannelsStep
            propertyId={property.id}
            exportUrl={exportUrl}
            canManage={can(user.role, "integrations:manage")}
            channels={property.calendarIntegrations.map((integration) => ({
              id: integration.id,
              channel: integration.channel,
              name: integration.name,
              importUrl: integration.importUrl,
              isActive: integration.isActive,
              lastSyncedAt: integration.lastSyncedAt?.toISOString() ?? null,
              lastSyncStatus: integration.lastSyncStatus,
              lastSyncError: integration.lastSyncError,
              events: integration._count.events,
            }))}
          />
        ) : null}
        {step === "publicar" ? (
          <PublishStep
            propertyId={property.id}
            slug={property.slug}
            status={property.status}
            checklist={checklist}
            reservations={property._count.reservations}
            canDelete={can(user.role, "properties:delete")}
          />
        ) : null}
      </fieldset>
    </>
  );
}
