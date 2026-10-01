import { PlusIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader, Panel, Table, Td, Th, Tr } from "@/components/admin/ui";
import { FilterBar, FilterDate, FilterSearch, FilterSelect, FilterTabs, Pagination } from "@/components/admin/url-filters";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import type { ReservationStatus } from "@/generated/prisma/enums";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { formatMoney, toCents } from "@/lib/money";
import { RESERVATION_STATUS_TONE } from "@/lib/reservation-status";
import { requirePageUser } from "@/server/auth/guard";
import { can } from "@/server/auth/permissions";
import { listPropertyOptions, listReservations } from "@/server/queries/reservations";

const STATUSES: ReservationStatus[] = ["AWAITING_PAYMENT", "PROOF_RECEIVED", "UNDER_REVIEW", "CONFIRMED", "COMPLETED", "CANCELLED", "EXPIRED", "REJECTED", "PENDING"];

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/reservas">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.nav" });
  return { title: t("reservations") };
}

export default async function ReservationsPage({ params, searchParams }: PageProps<"/[locale]/admin/reservas">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const user = await requirePageUser("reservations:read");
  const query = await searchParams;
  const get = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : undefined);
  const statusParam = get("status");
  const status = statusParam === "attention" || STATUSES.includes(statusParam as ReservationStatus) ? (statusParam as ReservationStatus | "attention") : undefined;

  const [t, tStatus, data, properties] = await Promise.all([
    getTranslations("admin.reservations"),
    getTranslations("status"),
    listReservations(user, { q: get("q"), status, propertyId: get("property"), from: get("from"), to: get("to"), page: Number(get("page")) || 1 }),
    listPropertyOptions(user),
  ]);
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const all = Object.values(data.statusCounts).reduce((sum, count) => sum + (count ?? 0), 0);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          can(user.role, "reservations:write") ? (
            <Link href="/admin/reservas/nueva" className={buttonClasses()}>
              <PlusIcon size={16} weight="bold" />
              {t("new")}
            </Link>
          ) : null
        }
      />

      <FilterBar>
        <FilterTabs
          name="status"
          options={[
            { value: "", label: t("all"), count: all },
            { value: "attention", label: t("attention") },
            ...STATUSES.filter((s) => data.statusCounts[s]).map((s) => ({ value: s, label: tStatus(`reservation.${s}`), count: data.statusCounts[s] })),
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSearch placeholder={t("search")} />
          <FilterSelect name="property" label={t("allProperties")} options={properties.map((p) => ({ value: p.id, label: p.title }))} />
          <FilterDate name="from" label={t("from")} />
          <FilterDate name="to" label={t("to")} />
        </div>
      </FilterBar>

      <Panel padded={false}>
        {data.items.length ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t("table.code")}</Th>
                  <Th>{t("table.guest")}</Th>
                  <Th>{t("table.property")}</Th>
                  <Th>{t("table.stay")}</Th>
                  <Th className="text-right">{t("table.total")}</Th>
                  <Th>{t("table.status")}</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((reservation) => (
                  <Tr key={reservation.id}>
                    <Td>
                      <Link href={`/admin/reservas/${reservation.id}`} className="tabular font-medium text-accent-text hover:underline">
                        {reservation.code}
                      </Link>
                      <p className="text-xs text-ink-3">{t(`source.${reservation.source}`)}</p>
                    </Td>
                    <Td>
                      <p className="font-medium">
                        {reservation.guest.firstName} {reservation.guest.lastName}
                      </p>
                      <p className="text-xs text-ink-3">{reservation.guest.email}</p>
                    </Td>
                    <Td className="text-ink-2">{reservation.property.title}</Td>
                    <Td className="whitespace-nowrap">
                      <p>
                        {day.format(reservation.checkIn)} - {day.format(reservation.checkOut)}
                      </p>
                      <p className="text-xs text-ink-3">{t("nightsGuests", { nights: reservation.nights, guests: reservation.guestCount })}</p>
                    </Td>
                    <Td className="tabular text-right whitespace-nowrap">{formatMoney(toCents(reservation.total), reservation.currency, locale)}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Badge tone={RESERVATION_STATUS_TONE[reservation.status]}>{tStatus(`reservation.${reservation.status}`)}</Badge>
                        {reservation.hasConflict ? (
                          <span title={t("conflict")} aria-label={t("conflict")} className="text-danger-fg">
                            <WarningIcon size={16} weight="fill" />
                          </span>
                        ) : null}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={data.page}
              pages={data.pages}
              labels={{ previous: t("previous"), next: t("next"), summary: t("pageSummary", { page: data.page, pages: data.pages, total: data.total }) }}
            />
          </>
        ) : (
          <div className="p-6">
            <EmptyState title={t("empty")} description={t("emptyHint")} />
          </div>
        )}
      </Panel>
    </>
  );
}
