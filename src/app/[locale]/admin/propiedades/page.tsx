import { ArrowsClockwiseIcon, HouseLineIcon, PlusIcon, StarIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { toDbDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requirePageUser } from "@/server/auth/guard";
import { can } from "@/server/auth/permissions";
import { listAdminProperties } from "@/server/queries/properties";

const TONES = { DRAFT: "neutral", PUBLISHED: "success", PAUSED: "warning", ARCHIVED: "muted" } as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/propiedades">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.nav" });
  return { title: t("properties") };
}

export default async function AdminPropertiesPage({ params }: PageProps<"/[locale]/admin/propiedades">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const user = await requirePageUser("properties:read");
  const [t, tStatus, tTypes, properties] = await Promise.all([
    getTranslations("admin.properties"),
    getTranslations("status.property"),
    getTranslations("propertyTypes"),
    listAdminProperties(user),
  ]);
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle", { count: properties.length })}
        actions={
          can(user.role, "properties:write") ? (
            <Link href="/admin/propiedades/nueva" className={buttonClasses()}>
              <PlusIcon size={16} weight="bold" />
              {t("new")}
            </Link>
          ) : null
        }
      />
      {properties.length ? (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {properties.map((property) => (
            <li key={property.id}>
              <Link href={`/admin/propiedades/${property.id}`} className="group block overflow-hidden rounded-2xl border border-line bg-surface shadow-hairline transition-shadow hover:shadow-soft">
                <div className="relative aspect-[16/10] bg-surface-2">
                  {property.image ? (
                    <Image src={property.image.url} alt={property.image.alt} fill sizes="(min-width: 1280px) 30vw, 50vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                  ) : (
                    <span className="grid h-full place-items-center text-ink-3">
                      <HouseLineIcon size={32} />
                    </span>
                  )}
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate font-semibold">
                        {property.featured ? <StarIcon size={14} weight="fill" className="shrink-0 text-accent-text" aria-label={t("featured")} /> : null}
                        {property.title}
                      </p>
                      <p className="truncate text-sm text-ink-3">
                        {property.city}, {tTypes(property.type)}
                      </p>
                    </div>
                    <Badge tone={TONES[property.status]}>{tStatus(property.status)}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="tabular">
                      {formatMoney(property.basePrice, property.currency, locale)} <span className="text-ink-3">{t("perNight")}</span>
                    </span>
                    <span className="text-ink-3">{t("guests", { count: property.maxGuests })}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-ink-3">
                    <span>
                      {property.occupiedNow
                        ? t("occupiedNow")
                        : property.next
                          ? t("nextStay", { date: day.format(toDbDate(property.next.checkIn)) })
                          : t("noUpcoming")}
                    </span>
                    {property.channels.length ? (
                      <span className="inline-flex items-center gap-1">
                        {property.channels.some((c) => c.isActive && c.lastSyncStatus === "FAILED") ? (
                          <WarningCircleIcon size={13} className="text-danger-fg" />
                        ) : (
                          <ArrowsClockwiseIcon size={13} />
                        )}
                        {t("channels", { count: property.channels.length })}
                      </span>
                    ) : null}
                    {property.owner ? <span>{property.owner}</span> : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<HouseLineIcon size={22} />}
          title={t("empty")}
          description={t("emptyHint")}
          action={
            can(user.role, "properties:write") ? (
              <Link href="/admin/propiedades/nueva" className={buttonClasses({ size: "sm" })}>
                {t("new")}
              </Link>
            ) : null
          }
        />
      )}
    </>
  );
}
