import {
  CalendarPlusIcon,
  CheckCircleIcon,
  ClockIcon,
  EnvelopeSimpleIcon,
  HourglassMediumIcon,
  LockKeyIcon,
  MapPinIcon,
  NavigationArrowIcon,
  WarningCircleIcon,
  WhatsappLogoIcon,
  XCircleIcon,
} from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookingSteps } from "@/components/booking/booking-steps";
import { PriceBreakdown } from "@/components/booking/price-breakdown";
import { HoldCountdown, PrintButton } from "@/components/reservation/guest-widgets";
import { LookupForm } from "@/components/reservation/lookup-form";
import { ProofUploader } from "@/components/reservation/proof-uploader";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { CopyButton } from "@/components/ui/primitives";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { whatsappUrl } from "@/lib/contact";
import { toDbDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PROOF_STATUS_TONE, RESERVATION_STATUS_TONE, bookingStepFor, canUploadProof } from "@/lib/reservation-status";
import { getGuestReservation } from "@/server/queries/guest";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/reserva/[code]">): Promise<Metadata> {
  const { locale, code } = await params;
  const t = await getTranslations({ locale, namespace: "reservation" });
  return { title: t("metaTitle", { code: code.toUpperCase() }), robots: { index: false, follow: false } };
}

export default async function GuestReservationPage({ params }: PageProps<"/[locale]/reserva/[code]">) {
  const { locale: raw, code } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const [result, t, tStatus, tCommon, settings] = await Promise.all([
    getGuestReservation(code, locale),
    getTranslations("reservation"),
    getTranslations("status"),
    getTranslations("common"),
    getSettings(),
  ]);

  if (result.status === "not-found") notFound();
  if (result.status === "locked") {
    return (
      <div className="mx-auto max-w-md px-4 pt-[130px] pb-24">
        <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent-text">
          <LockKeyIcon size={24} />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">{t("locked.title")}</h1>
        <p className="mt-2 mb-8 leading-relaxed text-ink-3">{t("locked.body")}</p>
        <LookupForm defaultCode={result.code} />
      </div>
    );
  }

  const r = result.reservation;
  const agency = settings.agency;
  const money = (cents: number) => formatMoney(cents, r.currency, locale);
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(toDbDate(iso));
  const awaitingPayment = r.status === "PENDING" || r.status === "AWAITING_PAYMENT";
  const reviewing = r.status === "PROOF_RECEIVED" || r.status === "UNDER_REVIEW";
  const confirmed = r.status === "CONFIRMED";
  const closed = r.status === "REJECTED" || r.status === "CANCELLED" || r.status === "EXPIRED";
  const cancellation = r.property.cancellationPolicy || settings.policies.cancellation[locale] || settings.policies.cancellation.es;
  const suggestedAmount = String(Math.round((r.payment?.amountDue ?? r.total) / 100));

  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-[100px] pb-24 sm:px-6 lg:px-10">
      <div className="print:hidden">
        <BookingSteps current={bookingStepFor(r.status)} complete={confirmed || r.status === "COMPLETED"} />
      </div>

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
        <div className="min-w-0 space-y-10">
          <header>
            <p className="text-sm text-ink-3">{t("hello", { name: r.guest.firstName })}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
                {t("title")} <span className="tabular">{r.code}</span>
              </h1>
              <Badge tone={RESERVATION_STATUS_TONE[r.status]} className="text-sm">
                {tStatus(`reservation.${r.status}`)}
              </Badge>
            </div>
            <p className="mt-3 max-w-[60ch] leading-relaxed text-ink-2">{t(`statusText.${r.status}`)}</p>
          </header>

          {awaitingPayment && r.payment ? (
            <section aria-labelledby="pay-title" className="space-y-6">
              <div>
                <h2 id="pay-title" className="text-xl font-semibold tracking-tight">
                  {t("payment.title")}
                </h2>
                <p className="mt-1.5 text-sm text-ink-3">{t("payment.subtitle")}</p>
              </div>
              {r.holdExpiresAt ? <HoldCountdown deadline={r.holdExpiresAt} /> : null}
              <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-2 px-5 py-4">
                  <p className="text-sm text-ink-2">{t("payment.amount")}</p>
                  <div className="flex items-center gap-3">
                    <p className="tabular text-2xl font-semibold tracking-tight">{money(r.payment.amountDue)}</p>
                    <CopyButton value={suggestedAmount} label={tCommon("copy")} copiedLabel={tCommon("copied")} />
                  </div>
                </div>
                <dl className="divide-y divide-line">
                  {(
                    [
                      ["bank", r.payment.bank.bankName],
                      ["holder", r.payment.bank.accountHolder],
                      ["cbu", r.payment.bank.cbu],
                      ["alias", r.payment.bank.alias],
                      ["taxId", r.payment.bank.accountTaxId],
                    ] as const
                  )
                    .filter(([, value]) => value)
                    .map(([key, value]) => (
                      <div key={key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                        <dt className="text-sm text-ink-3">{t(`payment.${key}`)}</dt>
                        <dd className="flex items-center gap-3">
                          <span className="tabular font-medium break-all">{value}</span>
                          {key === "cbu" || key === "alias" ? <CopyButton value={value} label={tCommon("copy")} copiedLabel={tCommon("copied")} /> : null}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
              <Notice tone="neutral">{t("payment.reference", { code: r.code })}</Notice>
            </section>
          ) : null}

          {r.payment && canUploadProof(r.status) ? (
            <section aria-labelledby="proof-title" className="space-y-4 print:hidden">
              <div>
                <h2 id="proof-title" className="text-xl font-semibold tracking-tight">
                  {reviewing ? t("upload.anotherTitle") : t("upload.title")}
                </h2>
                <p className="mt-1.5 text-sm text-ink-3">{reviewing ? t("upload.anotherSubtitle") : t("upload.subtitle")}</p>
              </div>
              <ProofUploader code={r.code} suggestedAmount={suggestedAmount} />
            </section>
          ) : null}

          {r.payment && r.payment.proofs.length > 0 ? (
            <section aria-labelledby="proofs-title">
              <h2 id="proofs-title" className="text-xl font-semibold tracking-tight">
                {t("proofs.title")}
              </h2>
              <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
                {r.payment.proofs.map((proof) => (
                  <li key={proof.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{proof.fileName}</p>
                      <p className="text-xs text-ink-3">
                        {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", hourCycle: locale === "en" ? "h12" : "h23", timeZone: "America/Argentina/Cordoba" }).format(new Date(proof.uploadedAt))}
                      </p>
                      {proof.reviewNote ? <p className="mt-2 text-sm text-ink-2">{proof.reviewNote}</p> : null}
                    </div>
                    <Badge tone={PROOF_STATUS_TONE[proof.status]}>{tStatus(`proof.${proof.status}`)}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {reviewing ? (
            <Notice tone="info" icon={<HourglassMediumIcon size={18} />} title={t("reviewing.title")}>
              {t("reviewing.body")}
            </Notice>
          ) : null}

          {confirmed || r.status === "COMPLETED" ? (
            <section aria-labelledby="arrival-title" className="space-y-6">
              {confirmed ? (
                <Notice tone="success" icon={<CheckCircleIcon size={18} weight="fill" />} title={t("confirmed.title")}>
                  {t("confirmed.body")}
                </Notice>
              ) : null}
              <div className="rounded-2xl border border-line bg-surface p-6">
                <h2 id="arrival-title" className="text-xl font-semibold tracking-tight">
                  {t("confirmed.arrivalTitle")}
                </h2>
                <dl className="mt-5 space-y-4 text-sm">
                  {r.property.address ? (
                    <div className="flex gap-3">
                      <MapPinIcon size={20} className="shrink-0 text-ink-3" />
                      <div>
                        <dt className="sr-only">{t("confirmed.address")}</dt>
                        <dd className="font-medium">
                          {r.property.address}, {r.property.city}
                        </dd>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex gap-3">
                    <ClockIcon size={20} className="shrink-0 text-ink-3" />
                    <dd>
                      {t("confirmed.times", { checkIn: r.property.checkInTime, checkOut: r.property.checkOutTime })}
                    </dd>
                  </div>
                </dl>
                {r.property.arrivalInstructions ? (
                  <p className="mt-5 border-t border-line pt-5 text-sm leading-relaxed whitespace-pre-line text-ink-2">{r.property.arrivalInstructions}</p>
                ) : null}
                <div className="mt-6 flex flex-wrap gap-2 print:hidden">
                  <a href={`/api/reservations/${r.code}/calendar`} className={buttonClasses({ variant: "secondary" })}>
                    <CalendarPlusIcon size={18} />
                    {t("confirmed.addToCalendar")}
                  </a>
                  {r.property.latitude !== null && r.property.longitude !== null ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${r.property.latitude},${r.property.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonClasses({ variant: "secondary" })}
                    >
                      <NavigationArrowIcon size={18} />
                      {t("confirmed.directions")}
                    </a>
                  ) : null}
                  <PrintButton />
                </div>
              </div>
            </section>
          ) : null}

          {closed ? (
            <Notice tone={r.status === "EXPIRED" ? "warning" : "danger"} icon={r.status === "EXPIRED" ? <WarningCircleIcon size={18} /> : <XCircleIcon size={18} />}>
              {r.cancelReason ? <p className="mb-2">{r.cancelReason}</p> : null}
              <Link href={`/propiedades/${r.property.slug}`} className="font-semibold underline underline-offset-4">
                {t("closed.bookAgain")}
              </Link>
            </Notice>
          ) : null}
        </div>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-line bg-surface p-6 shadow-soft">
            <div className="flex gap-4">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-surface-2">
                {r.property.image ? <Image src={r.property.image.url} alt={r.property.image.alt} fill sizes="80px" className="object-cover" /> : null}
              </div>
              <div className="min-w-0">
                <Link href={`/propiedades/${r.property.slug}`} className="block truncate font-semibold tracking-tight hover:underline">
                  {r.property.title}
                </Link>
                <p className="text-sm text-ink-3">{r.property.city}</p>
              </div>
            </div>
            <dl className="mt-6 space-y-3 border-t border-line pt-5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-3">{t("summary.checkIn")}</dt>
                <dd className="text-right font-medium first-letter:uppercase">{day(r.checkIn)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-3">{t("summary.checkOut")}</dt>
                <dd className="text-right font-medium first-letter:uppercase">{day(r.checkOut)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-3">{t("summary.guests")}</dt>
                <dd className="font-medium">{r.guestCount}</dd>
              </div>
            </dl>
            <PriceBreakdown quote={r.quote} className="mt-6 border-t border-line pt-5" />
          </div>

          <div className="rounded-3xl bg-surface-2 p-6 print:hidden">
            <p className="font-semibold tracking-tight">{t("contact.title")}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-3">{t("contact.body", { code: r.code })}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {agency.whatsapp ? (
                <a href={whatsappUrl(agency.whatsapp, t("contact.whatsappMessage", { code: r.code }))} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  <WhatsappLogoIcon size={16} />
                  WhatsApp
                </a>
              ) : null}
              {agency.email ? (
                <a href={`mailto:${agency.email}?subject=${encodeURIComponent(r.code)}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  <EnvelopeSimpleIcon size={16} />
                  Email
                </a>
              ) : null}
            </div>
          </div>

          {cancellation ? (
            <div className="px-1 text-xs leading-relaxed text-ink-3">
              <p className="font-semibold text-ink-2">{t("summary.cancellation")}</p>
              <p className="mt-1 whitespace-pre-line">{cancellation}</p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
