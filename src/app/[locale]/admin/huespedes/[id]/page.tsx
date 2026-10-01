import { ArrowLeftIcon, EnvelopeSimpleIcon, WhatsappLogoIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GuestForm } from "@/components/admin/guest-form";
import { PageHeader, Panel, Table, Td, Th, Tr } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { whatsappUrl } from "@/lib/contact";
import { formatMoney, toCents } from "@/lib/money";
import { RESERVATION_STATUS_TONE } from "@/lib/reservation-status";
import { requirePageUser } from "@/server/auth/guard";
import { can } from "@/server/auth/permissions";
import { getGuest } from "@/server/queries/directory";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/huespedes/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.nav" });
  return { title: t("guests") };
}

export default async function GuestPage({ params }: PageProps<"/[locale]/admin/huespedes/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const user = await requirePageUser("guests:read");
  const [guest, t, tStatus] = await Promise.all([getGuest(id), getTranslations("admin.guests"), getTranslations("status")]);
  if (!guest) notFound();
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const spent = guest.reservations.filter((r) => r.status === "CONFIRMED" || r.status === "COMPLETED").reduce((sum, r) => sum + toCents(r.total), 0);
  const currency = guest.reservations[0]?.currency ?? "ARS";

  return (
    <>
      <PageHeader
        back={
          <Link href="/admin/huespedes" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
            <ArrowLeftIcon size={14} />
            {t("back")}
          </Link>
        }
        title={`${guest.firstName} ${guest.lastName}`}
        description={t("summaryLine", { count: guest.reservations.length, spent: formatMoney(spent, currency, locale) })}
        actions={
          <>
            <a href={`mailto:${guest.email}`} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line-strong px-4 text-sm font-medium hover:bg-surface-2">
              <EnvelopeSimpleIcon size={16} />
              {guest.email}
            </a>
            <a href={whatsappUrl(guest.phone)} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line-strong px-4 text-sm font-medium hover:bg-surface-2">
              <WhatsappLogoIcon size={16} />
              WhatsApp
            </a>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title={t("history")} padded={false}>
          <Table>
            <thead>
              <tr>
                <Th>{t("table.code")}</Th>
                <Th>{t("table.property")}</Th>
                <Th>{t("table.dates")}</Th>
                <Th className="text-right">{t("table.total")}</Th>
                <Th>{t("table.status")}</Th>
              </tr>
            </thead>
            <tbody>
              {guest.reservations.map((reservation) => (
                <Tr key={reservation.id}>
                  <Td>
                    <Link href={`/admin/reservas/${reservation.id}`} className="tabular font-medium text-accent-text hover:underline">
                      {reservation.code}
                    </Link>
                  </Td>
                  <Td className="text-ink-2">{reservation.property.title}</Td>
                  <Td className="whitespace-nowrap">
                    {day.format(reservation.checkIn)} - {day.format(reservation.checkOut)}
                  </Td>
                  <Td className="tabular text-right">{formatMoney(toCents(reservation.total), reservation.currency, locale)}</Td>
                  <Td>
                    <Badge tone={RESERVATION_STATUS_TONE[reservation.status]}>{tStatus(`reservation.${reservation.status}`)}</Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Panel>
        <Panel title={t("profile")}>
          <GuestForm
            id={guest.id}
            canWrite={can(user.role, "reservations:write")}
            initial={{ firstName: guest.firstName, lastName: guest.lastName, phone: guest.phone, country: guest.country ?? "", notes: guest.notes ?? "" }}
          />
        </Panel>
      </div>
    </>
  );
}
