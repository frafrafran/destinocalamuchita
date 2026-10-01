"use client";

import { ArrowLeftIcon, InfoIcon, LockSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useMemo, useRef, useState, useTransition } from "react";
import { type BookingInput, createReservationAction } from "@/actions/booking";
import { useCalendarLabels, useFormatDay } from "@/components/calendar/date-range-picker";
import { RangeCalendar, type RangeValue } from "@/components/calendar/range-calendar";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Checkbox, Counter } from "@/components/ui/primitives";
import type { Locale } from "@/i18n/config";
import { Link, useRouter } from "@/i18n/navigation";
import { type BlockedRange, canStay, occupiedNights } from "@/lib/availability";
import { type ISODate, addDays } from "@/lib/dates";
import { type PricingConfig, type Quote, calculateQuote, minNightsFor } from "@/lib/pricing";
import { BookingSteps } from "./booking-steps";
import { PriceBreakdown } from "./price-breakdown";

interface Props {
  property: {
    slug: string;
    title: string;
    city: string;
    image: { url: string; alt: string } | null;
    checkInTime: string;
    checkOutTime: string;
  };
  pricing: PricingConfig;
  blocked: BlockedRange[];
  today: ISODate;
  horizonDays: number;
  initial: { checkIn?: ISODate; checkOut?: ISODate; guests?: number };
  cancellationSummary: string;
}

type Fields = Pick<BookingInput, "firstName" | "lastName" | "email" | "phone" | "country" | "comments">;

export function BookingFlow({ property, pricing, blocked, today, horizonDays, initial, cancellationSummary }: Props) {
  const t = useTranslations("booking.flow");
  const te = useTranslations("errors");
  const tq = useTranslations("quoteErrors");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const labels = useCalendarLabels();
  const formatDay = useFormatDay();
  const [pending, startTransition] = useTransition();
  const errorRef = useRef<HTMLDivElement>(null);

  const occupied = useMemo(() => occupiedNights(blocked, today, addDays(today, horizonDays)), [blocked, today, horizonDays]);
  const startValid = Boolean(initial.checkIn && initial.checkOut && initial.checkIn >= today && canStay(occupied, initial.checkIn, initial.checkOut));
  const [range, setRange] = useState<RangeValue>(startValid ? { checkIn: initial.checkIn!, checkOut: initial.checkOut! } : { checkIn: null, checkOut: null });
  const [guests, setGuests] = useState(Math.min(Math.max(initial.guests ?? 2, 1), pricing.property.maxGuests));
  const [step, setStep] = useState<"dates" | "details">("dates");
  const [fields, setFields] = useState<Fields>({ firstName: "", lastName: "", email: "", phone: "", country: "", comments: "" });
  const [accepted, setAccepted] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ tone: "danger" | "warning"; text: string } | null>(null);
  const [serverQuote, setServerQuote] = useState<Quote | null>(null);

  const complete = Boolean(range.checkIn && range.checkOut);
  const available = complete && canStay(occupied, range.checkIn!, range.checkOut!);
  const quoteResult = complete ? calculateQuote({ checkIn: range.checkIn!, checkOut: range.checkOut!, guests, today }, pricing) : null;
  // After a PRICE_CHANGED response the server's figure is authoritative.
  const quote = serverQuote ?? (quoteResult?.ok ? quoteResult.quote : null);
  const canContinue = Boolean(available && quote);

  function quoteProblem(): string | null {
    if (!range.checkIn) return t("pickDates");
    if (!range.checkOut) return t("pickCheckOut");
    if (!available) return te("DATES_UNAVAILABLE");
    if (quoteResult && !quoteResult.ok) {
      const { code, ...values } = quoteResult.error;
      return tq(code, values);
    }
    return null;
  }

  function changeRange(next: RangeValue) {
    setRange(next);
    setServerQuote(null);
    setFormError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!quote || !range.checkIn || !range.checkOut || !accepted) return;
    setFieldErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await createReservationAction({
        slug: property.slug,
        checkIn: range.checkIn!,
        checkOut: range.checkOut!,
        guests,
        ...fields,
        expectedTotal: quote.total,
        acceptTerms: true,
        website: honeypot,
      });
      if (result.ok) {
        router.push(`/reserva/${result.data.code}`);
        return;
      }
      if (result.error === "VALIDATION") {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError({ tone: "danger", text: te("VALIDATION") });
      } else if (result.error === "PRICE_CHANGED" && result.details?.quote) {
        setServerQuote(result.details.quote as Quote);
        setFormError({ tone: "warning", text: te("PRICE_CHANGED") });
      } else if (result.error === "DATES_UNAVAILABLE") {
        setFormError({ tone: "danger", text: te("DATES_UNAVAILABLE") });
        setStep("dates");
        setRange({ checkIn: null, checkOut: null });
        router.refresh();
      } else if (result.error === "INVALID_STATE" && result.details?.reason === "NO_BANK_ACCOUNT") {
        setFormError({ tone: "danger", text: te("NO_BANK_ACCOUNT") });
      } else if (result.error === "QUOTE" && result.details?.code) {
        const { code, ...values } = result.details as { code: string } & Record<string, number>;
        setFormError({ tone: "danger", text: tq(code as "MIN_NIGHTS", values) });
        setStep("dates");
      } else {
        setFormError({ tone: "danger", text: te(result.error) });
      }
      requestAnimationFrame(() => errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    });
  }

  const set = (key: keyof Fields) => (event: { target: { value: string } }) => setFields((current) => ({ ...current, [key]: event.target.value }));
  const problem = quoteProblem();

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
      <div className="min-w-0">
        <BookingSteps current={step} />

        <div ref={errorRef} className="mt-8">
          {formError ? <Notice tone={formError.tone} icon={<WarningCircleIcon size={18} />}>{formError.text}</Notice> : null}
        </div>

        {step === "dates" ? (
          <section aria-labelledby="dates-title" className="mt-6">
            <h1 id="dates-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("datesTitle")}
            </h1>
            <p className="mt-2 text-ink-3">{t("datesSubtitle")}</p>
            <div className="mt-8 rounded-3xl border border-line bg-surface p-5 sm:p-8">
              <RangeCalendar
                value={range}
                onChange={changeRange}
                occupied={occupied}
                today={today}
                locale={locale}
                labels={labels}
                minNights={range.checkIn ? minNightsFor(range.checkIn, pricing) : pricing.property.minNights}
              />
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-line bg-surface px-5 py-4">
              <div>
                <p className="font-medium">{t("guests")}</p>
                <p className="text-sm text-ink-3">{t("maxGuests", { count: pricing.property.maxGuests })}</p>
              </div>
              <Counter
                value={guests}
                min={1}
                max={pricing.property.maxGuests}
                onChange={(value) => {
                  setGuests(value);
                  setServerQuote(null);
                }}
                decrementLabel={t("fewerGuests")}
                incrementLabel={t("moreGuests")}
              />
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
              <p className="flex items-center gap-2 text-sm text-ink-3" role="status">
                {problem ? (
                  <>
                    <InfoIcon size={16} />
                    {problem}
                  </>
                ) : (
                  t("datesReady", { checkIn: formatDay(range.checkIn!), checkOut: formatDay(range.checkOut!) })
                )}
              </p>
              <Button size="lg" disabled={!canContinue} onClick={() => setStep("details")}>
                {t("continue")}
              </Button>
            </div>
          </section>
        ) : (
          <form onSubmit={submit} noValidate aria-labelledby="details-title" className="mt-6">
            <button type="button" onClick={() => setStep("dates")} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink">
              <ArrowLeftIcon size={14} />
              {t("changeDates")}
            </button>
            <h1 id="details-title" className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("detailsTitle")}
            </h1>
            <p className="mt-2 text-ink-3">{t("detailsSubtitle")}</p>

            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              <Field label={t("firstName")} required error={fieldErrors.firstName}>
                {(props) => <Input {...props} autoComplete="given-name" value={fields.firstName} onChange={set("firstName")} maxLength={60} />}
              </Field>
              <Field label={t("lastName")} required error={fieldErrors.lastName}>
                {(props) => <Input {...props} autoComplete="family-name" value={fields.lastName} onChange={set("lastName")} maxLength={60} />}
              </Field>
              <Field label={t("email")} required hint={t("emailHint")} error={fieldErrors.email}>
                {(props) => <Input {...props} type="email" inputMode="email" autoComplete="email" value={fields.email} onChange={set("email")} maxLength={120} />}
              </Field>
              <Field label={t("phone")} required hint={t("phoneHint")} error={fieldErrors.phone}>
                {(props) => <Input {...props} type="tel" inputMode="tel" autoComplete="tel" value={fields.phone} onChange={set("phone")} maxLength={24} />}
              </Field>
              <Field label={`${t("country")} (${t("optional")})`} error={fieldErrors.country} className="sm:col-span-2">
                {(props) => <Input {...props} autoComplete="country-name" value={fields.country} onChange={set("country")} maxLength={60} />}
              </Field>
              <Field label={`${t("comments")} (${t("optional")})`} hint={t("commentsHint")} error={fieldErrors.comments} className="sm:col-span-2">
                {(props) => <Textarea {...props} value={fields.comments} onChange={set("comments")} maxLength={1000} rows={4} />}
              </Field>
              {/* Honeypot, invisible to people and assistive tech. */}
              <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label htmlFor="website">Website</label>
                <input id="website" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
              </div>
            </div>

            <label className="mt-8 flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-sm leading-relaxed text-ink-2">
              <Checkbox checked={accepted} onCheckedChange={(value) => setAccepted(value === true)} aria-invalid={fieldErrors.acceptTerms ? true : undefined} className="mt-0.5" />
              <span>
                {t.rich("acceptTerms", {
                  terms: (chunks) => (
                    <Link href="/terminos" target="_blank" className="font-medium text-accent-text underline underline-offset-4">
                      {chunks}
                    </Link>
                  ),
                  cancellation: (chunks) => (
                    <Link href="/cancelaciones" target="_blank" className="font-medium text-accent-text underline underline-offset-4">
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            </label>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-sm text-ink-3">
                <LockSimpleIcon size={16} />
                {t("nextStepHint")}
              </p>
              <Button type="submit" size="lg" loading={pending} disabled={!accepted || !canContinue}>
                {t("submit")}
              </Button>
            </div>
          </form>
        )}
      </div>

      <aside className="lg:pt-16">
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-soft lg:sticky lg:top-24">
          <div className="flex gap-4">
            <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-surface-2">
              {property.image ? <Image src={property.image.url} alt={property.image.alt} fill sizes="80px" className="object-cover" /> : null}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold tracking-tight">{property.title}</p>
              <p className="text-sm text-ink-3">{property.city}</p>
            </div>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 text-sm">
            <div>
              <dt className="text-ink-3">{t("checkIn")}</dt>
              <dd className="mt-0.5 font-medium">{range.checkIn ? formatDay(range.checkIn) : "-"}</dd>
              <dd className="text-xs text-ink-3">{t("fromTime", { time: property.checkInTime })}</dd>
            </div>
            <div>
              <dt className="text-ink-3">{t("checkOut")}</dt>
              <dd className="mt-0.5 font-medium">{range.checkOut ? formatDay(range.checkOut) : "-"}</dd>
              <dd className="text-xs text-ink-3">{t("untilTime", { time: property.checkOutTime })}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-ink-3">{t("guests")}</dt>
              <dd className="mt-0.5 font-medium">{t("guestsCount", { count: guests })}</dd>
            </div>
          </dl>
          {quote && available ? (
            <PriceBreakdown quote={quote} className="mt-6 border-t border-line pt-5" />
          ) : (
            <p className="mt-6 border-t border-line pt-5 text-sm text-ink-3">{t("summaryEmpty")}</p>
          )}
          {cancellationSummary ? (
            <p className="mt-6 border-t border-line pt-5 text-xs leading-relaxed text-ink-3">
              <span className="font-semibold text-ink-2">{t("cancellationTitle")} </span>
              {cancellationSummary}
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
