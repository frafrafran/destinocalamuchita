import { ArrowRightIcon, BedIcon, CalendarCheckIcon, CurrencyCircleDollarIcon, HouseLineIcon, ReceiptIcon, SignInIcon, SignOutIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OccupancyChart, RevenueChart, SourcesChart } from "@/components/admin/charts";
import { PageHeader, Panel, StatCard, Table, Td, Th, Tr } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Notice } from "@/components/ui/feedback";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { formatMoney, toCents } from "@/lib/money";
import { RESERVATION_STATUS_TONE } from "@/lib/reservation-status";
import { requirePageUser } from "@/server/auth/guard";
import { getDashboard } from "@/server/queries/admin";

export default async function DashboardPage({ params }: PageProps<"/[locale]/admin">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const user = await requirePageUser("dashboard:view");
  const [t, tStatus, data] = await Promise.all([getTranslations("admin.dashboard"), getTranslations("status"), getDashboard(user)]);

  const money = (cents: number) => formatMoney(cents, data.currency, locale);
  const percent = (value: number) => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(value);
  const day = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const month = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(toDbDate(data.monthStart));
  const delta = (current: number, previous: number) =>
    previous === 0 ? null : new Intl.NumberFormat(locale, { style: "percent", signDisplay: "exceptZero", maximumFractionDigits: 0 }).format((current - previous) / previous);
  const revenueDelta = delta(data.kpis.revenue, data.kpis.prevRevenue);

  return (
    <>
      <PageHeader
        title={t("title", { name: user.name.split(" ")[0]! })}
        description={t("subtitle", { month })}
      />

      {data.conflicts.length ? (
        <Notice tone="danger" icon={<WarningIcon size={18} />} title={t("conflictsTitle", { count: data.conflicts.length })} className="mb-6">
          <ul className="mt-1 space-y-1">
            {data.conflicts.map((reservation) => (
              <li key={reservation.id}>
                <Link href={`/admin/reservas/${reservation.id}`} className="font-medium underline underline-offset-4">
                  {reservation.code}
                </Link>{" "}
                {reservation.property.title}, {day.format(reservation.checkIn)}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("revenueMonth")}
          value={money(data.kpis.revenue)}
          hint={revenueDelta ? t("vsPrevious", { delta: revenueDelta }) : t("noPrevious")}
          icon={<CurrencyCircleDollarIcon size={18} />}
          tone="accent"
        />
        <StatCard label={t("bookingsMonth")} value={data.kpis.bookings} hint={t("inHouse", { count: data.kpis.inHouse })} icon={<CalendarCheckIcon size={18} />} />
        <StatCard
          label={t("occupancyMonth")}
          value={percent(data.kpis.occupancy)}
          hint={t("todayOccupied", { occupied: data.kpis.occupiedToday, available: data.kpis.availableToday })}
          icon={<BedIcon size={18} />}
        />
        <StatCard
          label={t("pendingPayments")}
          value={data.kpis.pendingProofs}
          hint={t("awaitingTransfer", { count: data.kpis.awaitingPayment })}
          icon={<ReceiptIcon size={18} />}
          tone={data.kpis.pendingProofs ? "warning" : "neutral"}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel title={t("revenueChart")} description={t("revenueChartHint")}>
          <RevenueChart data={data.monthly} currency={data.currency} />
        </Panel>
        <Panel title={t("sources")} description={t("sourcesHint")}>
          <SourcesChart
            data={[
              { key: "direct", label: t("sourceDirect"), value: data.sources.direct },
              { key: "manual", label: t("sourceManual"), value: data.sources.manual },
              { key: "airbnb", label: "Airbnb", value: data.sources.airbnb },
              { key: "other", label: t("sourceOther"), value: data.sources.other },
            ]}
          />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel
          title={t("proofsTitle")}
          actions={
            <Link href="/admin/pagos" className="inline-flex items-center gap-1 text-sm font-medium text-accent-text">
              {t("viewAll")} <ArrowRightIcon size={14} />
            </Link>
          }
          padded={false}
        >
          {data.proofs.length ? (
            <ul className="divide-y divide-line">
              {data.proofs.map((proof) => {
                const reservation = proof.payment.reservation;
                const declared = proof.declaredAmount === null ? null : toCents(proof.declaredAmount);
                const due = toCents(proof.payment.amountDue);
                return (
                  <li key={proof.id}>
                    <Link href={`/admin/reservas/${reservation.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2/60">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning-bg text-warning-fg">
                        <ReceiptIcon size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {reservation.guest.firstName} {reservation.guest.lastName}
                        </span>
                        <span className="block truncate text-xs text-ink-3">
                          {reservation.code} · {reservation.property.title}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="tabular block text-sm font-medium">{money(due)}</span>
                        {declared !== null && declared !== due ? <span className="block text-xs text-warning-fg">{t("declared", { amount: money(declared) })}</span> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-ink-3">{t("noProofs")}</p>
          )}
        </Panel>

        <Panel title={t("occupancyByProperty")} description={month}>
          {data.byProperty.length ? <OccupancyChart data={data.byProperty} /> : <p className="text-sm text-ink-3">{t("noProperties")}</p>}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {(
          [
            ["arrivals", data.arrivals, SignInIcon],
            ["departures", data.departures, SignOutIcon],
          ] as const
        ).map(([key, list, Icon]) => (
          <Panel key={key} title={t(key)} description={t("nextDays")} padded={false}>
            {list.length ? (
              <ul className="divide-y divide-line">
                {list.map((reservation) => (
                  <li key={reservation.id}>
                    <Link href={`/admin/reservas/${reservation.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2/60">
                      <span className="w-20 shrink-0 text-sm font-medium first-letter:uppercase">{day.format(key === "arrivals" ? reservation.checkIn : reservation.checkOut)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {reservation.guest.firstName} {reservation.guest.lastName}
                        </span>
                        <span className="block truncate text-xs text-ink-3">{reservation.property.title}</span>
                      </span>
                      <Badge tone={RESERVATION_STATUS_TONE[reservation.status]}>{tStatus(`reservation.${reservation.status}`)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-5">
                <EmptyState icon={<Icon size={22} />} title={t(`${key}Empty`)} className="py-8" />
              </div>
            )}
          </Panel>
        ))}
      </div>

      <Panel
        className="mt-6"
        title={t("recent")}
        actions={
          <Link href="/admin/reservas" className="inline-flex items-center gap-1 text-sm font-medium text-accent-text">
            {t("viewAll")} <ArrowRightIcon size={14} />
          </Link>
        }
        padded={false}
      >
        {data.recent.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t("table.code")}</Th>
                <Th>{t("table.guest")}</Th>
                <Th>{t("table.property")}</Th>
                <Th>{t("table.dates")}</Th>
                <Th className="text-right">{t("table.total")}</Th>
                <Th>{t("table.status")}</Th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((reservation) => (
                <Tr key={reservation.id}>
                  <Td>
                    <Link href={`/admin/reservas/${reservation.id}`} className="tabular font-medium text-accent-text hover:underline">
                      {reservation.code}
                    </Link>
                  </Td>
                  <Td>
                    {reservation.guest.firstName} {reservation.guest.lastName}
                  </Td>
                  <Td className="text-ink-2">{reservation.property.title}</Td>
                  <Td className="whitespace-nowrap text-ink-2">
                    {day.format(toDbDate(fromDbDate(reservation.checkIn)))} - {day.format(toDbDate(fromDbDate(reservation.checkOut)))}
                  </Td>
                  <Td className="tabular text-right">{formatMoney(toCents(reservation.total), reservation.currency, locale)}</Td>
                  <Td>
                    <Badge tone={RESERVATION_STATUS_TONE[reservation.status]}>{tStatus(`reservation.${reservation.status}`)}</Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-5">
            <EmptyState icon={<HouseLineIcon size={22} />} title={t("noReservations")} />
          </div>
        )}
      </Panel>
    </>
  );
}
