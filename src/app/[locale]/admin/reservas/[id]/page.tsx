import { ArrowLeftIcon, EnvelopeSimpleIcon, PhoneIcon, WarningIcon, WhatsappLogoIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PriceBreakdown } from "@/components/booking/price-breakdown";
import { type ProofView, ProofReview } from "@/components/admin/proof-review";
import { AdminNotes, ReservationActions } from "@/components/admin/reservation-actions";
import { DefinitionList, PageHeader, Panel } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/feedback";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { whatsappUrl } from "@/lib/contact";
import { fromDbDate } from "@/lib/dates";
import { formatMoney, toCents } from "@/lib/money";
import type { Quote } from "@/lib/pricing";
import { PROOF_STATUS_TONE, RESERVATION_STATUS_TONE } from "@/lib/reservation-status";
import { requirePageUser } from "@/server/auth/guard";
import { can } from "@/server/auth/permissions";
import type { BankDetails } from "@/server/notifications/templates";
import { getReservationDetail } from "@/server/queries/reservations";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/reservas/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.nav" });
  return { title: t("reservations") };
}

export default async function ReservationDetailPage({ params }: PageProps<"/[locale]/admin/reservas/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const user = await requirePageUser("reservations:read");
  const detail = await getReservationDetail(user, id);
  if (!detail) notFound();
  const { reservation, duplicates, activity, notifications } = detail;
  const [t, tStatus, tActivity] = await Promise.all([getTranslations("admin.reservation"), getTranslations("status"), getTranslations("admin.activity")]);

  const money = (cents: number) => formatMoney(cents, reservation.currency, locale);
  const date = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", hourCycle: locale === "en" ? "h12" : "h23", timeZone: "America/Argentina/Cordoba" });
  const payment = reservation.payments[0] ?? null;
  const amountDue = payment ? toCents(payment.amountDue) : toCents(reservation.total);
  const canReview = can(user.role, "payments:review");
  const canWrite = can(user.role, "reservations:write");
  const bank = payment?.bankSnapshot as unknown as BankDetails | undefined;

  const proofs: ProofView[] = (payment?.proofs ?? []).map((proof) => {
    const declared = proof.declaredAmount === null ? null : toCents(proof.declaredAmount);
    return {
      id: proof.id,
      fileName: proof.fileName,
      mimeType: proof.mimeType,
      sizeKb: Math.round(proof.sizeBytes / 1024),
      uploadedAt: dateTime.format(proof.uploadedAt),
      status: proof.status,
      statusLabel: tStatus(`proof.${proof.status}`),
      statusTone: PROOF_STATUS_TONE[proof.status],
      declaredAmount: declared === null ? null : money(declared),
      amountMismatch: declared !== null && declared !== amountDue,
      reviewNote: proof.reviewNote,
      reviewedBy: proof.reviewedBy ? `${proof.reviewedBy.name}, ${proof.reviewedAt ? dateTime.format(proof.reviewedAt) : ""}` : null,
      duplicates: duplicates.get(proof.id) ?? [],
    };
  });

  return (
    <>
      <PageHeader
        back={
          <Link href="/admin/reservas" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
            <ArrowLeftIcon size={14} />
            {t("back")}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="tabular">{reservation.code}</span>
            <Badge tone={RESERVATION_STATUS_TONE[reservation.status]} className="text-sm">
              {tStatus(`reservation.${reservation.status}`)}
            </Badge>
          </span>
        }
        description={t("meta", {
          source: t(`source.${reservation.source}`),
          created: dateTime.format(reservation.createdAt),
          by: reservation.createdBy?.name ?? t("guest"),
        })}
        actions={
          <ReservationActions
            state={{
              id: reservation.id,
              status: reservation.status,
              checkIn: fromDbDate(reservation.checkIn),
              checkOut: fromDbDate(reservation.checkOut),
              guests: reservation.guestCount,
              maxGuests: reservation.property.maxGuests,
              amountDue: String(amountDue / 100),
              hasConflict: reservation.hasConflict,
              canReview,
              canWrite,
            }}
          />
        }
      />

      {reservation.hasConflict ? (
        <Notice tone="danger" icon={<WarningIcon size={18} />} title={t("conflictTitle")} className="mb-6">
          {t("conflictBody")}{" "}
          <Link href={`/admin/calendario?property=${reservation.property.id}`} className="font-semibold underline underline-offset-4">
            {t("openCalendar")}
          </Link>
        </Notice>
      ) : null}
      {reservation.holdExpiresAt && ["PENDING", "AWAITING_PAYMENT"].includes(reservation.status) ? (
        <Notice tone="warning" className="mb-6">
          {t("holdUntil", { date: dateTime.format(reservation.holdExpiresAt) })}
        </Notice>
      ) : null}
      {reservation.cancelReason && ["CANCELLED", "REJECTED"].includes(reservation.status) ? (
        <Notice tone="neutral" className="mb-6" title={t("reasonTitle")}>
          {reservation.cancelReason}
        </Notice>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Panel title={t("stay")}>
            <DefinitionList
              items={[
                { label: t("property"), value: <Link href={`/admin/propiedades/${reservation.property.id}`} className="text-accent-text hover:underline">{reservation.property.title}</Link> },
                { label: t("checkIn"), value: <span className="inline-block first-letter:uppercase">{date.format(reservation.checkIn)}</span> },
                { label: t("checkOut"), value: <span className="inline-block first-letter:uppercase">{date.format(reservation.checkOut)}</span> },
                { label: t("nights"), value: reservation.nights },
                { label: t("guests"), value: reservation.guestCount },
                { label: t("language"), value: reservation.locale.toUpperCase() },
              ]}
            />
            {reservation.comments ? (
              <div className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm">
                <p className="text-xs font-medium text-ink-3">{t("comments")}</p>
                <p className="mt-1 whitespace-pre-line">{reservation.comments}</p>
              </div>
            ) : null}
          </Panel>

          <Panel title={t("payment")} description={payment ? tStatus(`payment.${payment.status}`) : undefined}>
            <div className="grid gap-6 md:grid-cols-2">
              <PriceBreakdown quote={reservation.priceBreakdown as unknown as Quote} />
              <div>
                <DefinitionList
                  items={[
                    { label: t("amountDue"), value: money(amountDue) },
                    { label: t("amountReceived"), value: payment?.amountReceived ? money(toCents(payment.amountReceived)) : "-" },
                    { label: t("verifiedBy"), value: payment?.verifiedBy ? `${payment.verifiedBy.name}` : "-" },
                  ]}
                />
                {bank?.cbu || bank?.alias ? (
                  <div className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-xs leading-relaxed text-ink-2">
                    <p className="font-medium text-ink-3">{t("bankShown")}</p>
                    <p>{bank.bankName}</p>
                    <p>{bank.accountHolder}</p>
                    <p className="tabular">CBU {bank.cbu}</p>
                    <p>Alias {bank.alias}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </Panel>

          <Panel title={t("proofs", { count: proofs.length })}>
            {proofs.length ? (
              <div className="space-y-4">
                {proofs.map((proof) => (
                  <ProofReview key={proof.id} proof={proof} amountDue={String(amountDue / 100)} canReview={canReview} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-3">{t("noProofs")}</p>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title={t("guestTitle")}>
            <p className="text-lg font-semibold tracking-tight">
              {reservation.guest.firstName} {reservation.guest.lastName}
            </p>
            {reservation.guest.country ? <p className="text-sm text-ink-3">{reservation.guest.country}</p> : null}
            <ul className="mt-4 space-y-2 text-sm">
              <li>
                <a href={`mailto:${reservation.guest.email}?subject=${reservation.code}`} className="inline-flex items-center gap-2 text-ink-2 hover:text-ink">
                  <EnvelopeSimpleIcon size={16} className="text-ink-3" />
                  {reservation.guest.email}
                </a>
              </li>
              <li className="flex flex-wrap items-center gap-3">
                <a href={`tel:${reservation.guest.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-2 text-ink-2 hover:text-ink">
                  <PhoneIcon size={16} className="text-ink-3" />
                  {reservation.guest.phone}
                </a>
                <a href={whatsappUrl(reservation.guest.phone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                  <WhatsappLogoIcon size={16} />
                  WhatsApp
                </a>
              </li>
            </ul>
            {can(user.role, "guests:read") ? (
              <Link href={`/admin/huespedes/${reservation.guest.id}`} className="mt-4 inline-block text-sm font-medium text-accent-text hover:underline">
                {t("guestHistory", { count: reservation.guest._count.reservations })}
              </Link>
            ) : null}
          </Panel>

          <Panel title={t("notes")}>
            <AdminNotes reservationId={reservation.id} initial={reservation.adminNotes ?? ""} canWrite={canWrite} />
          </Panel>

          <Panel title={t("activity")}>
            <ol className="relative space-y-4 border-l border-line pl-5">
              {activity.map((entry) => (
                <li key={entry.id} className="relative text-sm">
                  <span aria-hidden className="absolute top-1.5 -left-[25px] size-2 rounded-full bg-line-strong" />
                  <p className="font-medium">{tActivity.has(entry.action) ? tActivity(entry.action) : entry.action}</p>
                  <p className="text-xs text-ink-3">
                    {dateTime.format(entry.createdAt)} · {entry.actor?.name ?? t(`actor.${entry.actorType}`)}
                  </p>
                </li>
              ))}
            </ol>
          </Panel>

          {notifications.length ? (
            <Panel title={t("emails")}>
              <ul className="divide-y divide-line text-sm">
                {notifications.map((notification) => (
                  <li key={notification.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate">{t.has(`templates.${notification.template}`) ? t(`templates.${notification.template}`) : notification.template}</p>
                      <p className="truncate text-xs text-ink-3">
                        {notification.recipient} · {dateTime.format(notification.createdAt)}
                      </p>
                      {notification.lastError ? <p className="truncate text-xs text-danger-fg">{notification.lastError}</p> : null}
                    </div>
                    <Badge tone={notification.status === "SENT" ? "success" : notification.status === "FAILED" ? "danger" : "neutral"}>{t(`emailStatus.${notification.status}`)}</Badge>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}
