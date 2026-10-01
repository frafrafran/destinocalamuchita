import { CheckCircleIcon, PauseCircleIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SyncAllButton, SyncOneButton, UnblockButton } from "@/components/admin/channels-overview";
import { PageHeader, Panel, Table, Td, Th, Tr } from "@/components/admin/ui";
import { EmptyState } from "@/components/ui/feedback";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { addDays, fromDbDate, todayISO, toDbDate } from "@/lib/dates";
import { requirePageUser } from "@/server/auth/guard";
import { CHANNELS } from "@/server/calendar/channels";
import { prisma } from "@/server/db";
import { env } from "@/server/env";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/disponibilidad">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.nav" });
  return { title: t("availability") };
}

export default async function AvailabilityPage({ params }: PageProps<"/[locale]/admin/disponibilidad">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  await requirePageUser("integrations:manage");
  const today = todayISO();
  const [t, tCal, integrations, blocks] = await Promise.all([
    getTranslations("admin.availability"),
    getTranslations("admin.calendar"),
    prisma.calendarIntegration.findMany({
      orderBy: [{ property: { title: "asc" } }, { createdAt: "asc" }],
      include: { property: { select: { id: true, title: true } }, _count: { select: { events: true } } },
    }),
    prisma.availability.findMany({
      where: { endDate: { gt: toDbDate(today) } },
      orderBy: { startDate: "asc" },
      include: { property: { select: { title: true } }, createdBy: { select: { name: true } } },
    }),
  ]);
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", hourCycle: locale === "en" ? "h12" : "h23", timeZone: "America/Argentina/Cordoba" });
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle", { minutes: env.ICAL_SYNC_INTERVAL_MINUTES })} actions={integrations.length ? <SyncAllButton /> : null} />

      <Panel title={t("channelsTitle")} description={t("channelsHint")} padded={false}>
        {integrations.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t("table.property")}</Th>
                <Th>{t("table.channel")}</Th>
                <Th>{t("table.status")}</Th>
                <Th>{t("table.lastSync")}</Th>
                <Th className="text-right">{t("table.events")}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {integrations.map((integration) => (
                <Tr key={integration.id}>
                  <Td>
                    <Link href={`/admin/propiedades/${integration.property.id}?paso=canales`} className="font-medium text-accent-text hover:underline">
                      {integration.property.title}
                    </Link>
                  </Td>
                  <Td>{CHANNELS[integration.channel].label}</Td>
                  <Td>
                    {!integration.isActive ? (
                      <span className="inline-flex items-center gap-1.5 text-ink-3">
                        <PauseCircleIcon size={16} />
                        {t("paused")}
                      </span>
                    ) : integration.lastSyncStatus === "FAILED" ? (
                      <span className="inline-flex items-center gap-1.5 text-danger-fg" title={integration.lastSyncError ?? undefined}>
                        <WarningCircleIcon size={16} weight="fill" />
                        {t("failing", { count: integration.consecutiveFailures })}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-success-fg">
                        <CheckCircleIcon size={16} weight="fill" />
                        {integration.lastSyncedAt ? t("ok") : t("pending")}
                      </span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-2">{integration.lastSyncedAt ? dateTime.format(integration.lastSyncedAt) : "-"}</Td>
                  <Td className="tabular text-right">{integration._count.events}</Td>
                  <Td className="text-right">{integration.isActive ? <SyncOneButton id={integration.id} /> : null}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-6">
            <EmptyState title={t("noChannels")} description={t("noChannelsHint")} />
          </div>
        )}
      </Panel>

      <Panel className="mt-6" title={t("blocksTitle")} description={t("blocksHint")} padded={false}>
        {blocks.length ? (
          <ul className="divide-y divide-line">
            {blocks.map((block) => (
              <li key={block.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5 text-sm">
                <span className="w-56 shrink-0 tabular">
                  {day.format(block.startDate)} - {day.format(toDbDate(addDays(fromDbDate(block.endDate), -1)))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{block.property.title}</span>
                  <span className="block truncate text-ink-3">
                    {tCal(`reasons.${block.reason}`)}
                    {block.note ? `: ${block.note}` : ""}
                    {block.createdBy ? ` (${block.createdBy.name})` : ""}
                  </span>
                </span>
                <UnblockButton id={block.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-ink-3">{t("noBlocks")}</p>
        )}
        <div className="border-t border-line px-5 py-3 text-sm">
          <Link href="/admin/calendario" className="font-medium text-accent-text hover:underline">
            {t("toCalendar")}
          </Link>
        </div>
      </Panel>
    </>
  );
}
