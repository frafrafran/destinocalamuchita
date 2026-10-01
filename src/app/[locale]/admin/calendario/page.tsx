import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { type BoardRange, type BoardRow, CalendarBoard } from "@/components/admin/calendar-board";
import { PageHeader } from "@/components/admin/ui";
import { type ISODate, addDays, addMonths, dayOfWeek, isValidISODate, startOfMonth, todayISO } from "@/lib/dates";
import { propertyScope, requirePageUser } from "@/server/auth/guard";
import { can } from "@/server/auth/permissions";
import { loadBlockedRanges } from "@/server/booking/availability";
import { CHANNELS } from "@/server/calendar/channels";
import { prisma } from "@/server/db";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/calendario">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.nav" });
  return { title: t("calendar") };
}

export default async function AdminCalendarPage({ params, searchParams }: PageProps<"/[locale]/admin/calendario">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requirePageUser("calendar:read");
  const query = await searchParams;
  const view = query.view === "week" || query.view === "list" ? query.view : "month";
  const today = todayISO();
  const anchor: ISODate = typeof query.date === "string" && isValidISODate(query.date) ? query.date : today;
  const start = view === "week" ? addDays(anchor, -((dayOfWeek(anchor) + 6) % 7)) : startOfMonth(anchor);
  const end = view === "week" ? addDays(start, 7) : addMonths(start, 1);
  const propertyFilter = typeof query.property === "string" ? query.property : null;

  const [t, tStatus, properties] = await Promise.all([
    getTranslations("admin.calendar"),
    getTranslations("status"),
    prisma.property.findMany({
      where: { ...propertyScope(user), status: { not: "ARCHIVED" } },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);
  const visible = propertyFilter ? properties.filter((property) => property.id === propertyFilter) : properties;
  const ranges = await loadBlockedRanges(prisma, visible.map((property) => property.id), start, end);

  const rows: BoardRow[] = visible.map((property) => ({
    id: property.id,
    title: property.title,
    ranges: (ranges.get(property.id) ?? []).map((range): BoardRange => {
      if (range.kind === "RESERVATION") {
        return { ...range, statusLabel: tStatus(`reservation.${range.status}`) };
      }
      if (range.kind === "BLOCK") return { ...range, reasonLabel: t(`reasons.${range.reason}`) };
      return { ...range, channel: CHANNELS[range.channel].label };
    }),
  }));

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <CalendarBoard
        rows={rows}
        view={view}
        start={start}
        end={end}
        today={today}
        canWrite={can(user.role, "calendar:write")}
        propertyFilter={propertyFilter}
        properties={properties}
      />
    </>
  );
}
