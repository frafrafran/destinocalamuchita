"use client";

import { CalendarBlankIcon } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useMemo, useState, useTransition } from "react";
import { getPropertyBookingDataAction } from "@/actions/calendar";
import { createManualReservationAction } from "@/actions/reservations";
import { PriceBreakdown } from "@/components/booking/price-breakdown";
import { DateRangePicker, useFormatDay } from "@/components/calendar/date-range-picker";
import type { RangeValue } from "@/components/calendar/range-calendar";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/primitives";
import { useRouter } from "@/i18n/navigation";
import { type BlockedRange, canStay, occupiedNights } from "@/lib/availability";
import { type ISODate, addDays } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { type PricingConfig, calculateQuote } from "@/lib/pricing";

interface Props {
  properties: { id: string; title: string; maxGuests: number }[];
  today: ISODate;
}

export function ManualReservationForm({ properties, today }: Props) {
  const t = useTranslations("admin.manual");
  const te = useTranslations("errors");
  const tq = useTranslations("quoteErrors");
  const locale = useLocale();
  const router = useRouter();
  const formatDay = useFormatDay();
  const [pending, startTransition] = useTransition();
  const [loading, startLoading] = useTransition();
  const [propertyId, setPropertyId] = useState("");
  const [data, setData] = useState<{ blocked: BlockedRange[]; pricing: PricingConfig } | null>(null);
  const [range, setRange] = useState<RangeValue>({ checkIn: null, checkOut: null });
  const [form, setForm] = useState({
    guests: "2",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    status: "CONFIRMED" as "CONFIRMED" | "AWAITING_PAYMENT" | "PENDING",
    totalOverride: "",
    adminNotes: "",
    locale: locale as "es" | "en" | "pt",
    notifyGuest: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Staff may record stays in the past, so the calendar starts 60 days back.
  const calendarStart = addDays(today, -60);
  const occupied = useMemo(() => (data ? occupiedNights(data.blocked, calendarStart, addDays(today, 540)) : new Set<ISODate>()), [data, calendarStart, today]);
  const property = properties.find((p) => p.id === propertyId);
  const quote = useMemo(() => {
    if (!data || !range.checkIn || !range.checkOut) return null;
    const config: PricingConfig = { ...data.pricing, property: { ...data.pricing.property, minNights: 1, maxNights: null }, seasons: data.pricing.seasons.map((s) => ({ ...s, minNights: null })) };
    return calculateQuote({ checkIn: range.checkIn, checkOut: range.checkOut, guests: Number(form.guests) || 1, today: range.checkIn }, config);
  }, [data, range, form.guests]);
  const free = range.checkIn && range.checkOut ? canStay(occupied, range.checkIn, range.checkOut) : true;

  function selectProperty(id: string) {
    setPropertyId(id);
    setData(null);
    setRange({ checkIn: null, checkOut: null });
    if (!id) return;
    startLoading(async () => {
      const result = await getPropertyBookingDataAction(id);
      if (result.ok) setData(result.data);
      else setError(te(result.error));
    });
  }

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setError(null);
    if (!range.checkIn || !range.checkOut) {
      setErrors({ checkIn: t("pickDates") });
      return;
    }
    startTransition(async () => {
      const result = await createManualReservationAction({
        propertyId,
        checkIn: range.checkIn!,
        checkOut: range.checkOut!,
        guests: Number(form.guests),
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        status: form.status,
        totalOverride: form.totalOverride,
        adminNotes: form.adminNotes,
        locale: form.locale,
        notifyGuest: form.notifyGuest,
      });
      if (result.ok) {
        router.push(`/admin/reservas/${result.data.id}`);
        return;
      }
      if (result.error === "VALIDATION") setErrors(result.fieldErrors ?? {});
      if (result.error === "QUOTE" && result.details?.code) {
        const { code, ...values } = result.details as { code: string } & Record<string, number>;
        setError(tq(code as "MAX_GUESTS", values));
      } else setError(te(result.error));
    });
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="space-y-6 rounded-2xl border border-line bg-surface p-6">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("property")} required error={errors.propertyId} className="sm:col-span-2">
            {(props) => (
              <Select {...props} value={propertyId} onChange={(event) => selectProperty(event.target.value)}>
                <option value="">{t("chooseProperty")}</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("dates")} required error={errors.checkIn ?? errors.checkOut} hint={loading ? t("loadingCalendar") : undefined}>
            {(props) => (
              <DateRangePicker
                value={range}
                onChange={setRange}
                today={calendarStart}
                occupied={occupied}
                trigger={() => (
                  <button type="button" {...props} disabled={!data} className="flex h-11 w-full items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 text-left text-ink disabled:opacity-50">
                    <CalendarBlankIcon size={17} className="text-ink-3" />
                    {range.checkIn && range.checkOut ? `${formatDay(range.checkIn)} - ${formatDay(range.checkOut)}` : t("pickDates")}
                  </button>
                )}
              />
            )}
          </Field>
          <Field label={t("guests")} required error={errors.guests} hint={property ? t("maxGuests", { count: property.maxGuests }) : undefined}>
            {(props) => <Input {...props} type="number" min={1} max={property?.maxGuests ?? 50} value={form.guests} onChange={set("guests")} />}
          </Field>
          {!free ? <Notice tone="danger" className="sm:col-span-2">{te("DATES_UNAVAILABLE")}</Notice> : null}
        </div>

        <fieldset className="grid gap-5 border-t border-line pt-6 sm:grid-cols-2">
          <legend className="mb-4 text-sm font-semibold">{t("guestTitle")}</legend>
          <Field label={t("firstName")} required error={errors.firstName}>
            {(props) => <Input {...props} value={form.firstName} onChange={set("firstName")} />}
          </Field>
          <Field label={t("lastName")} required error={errors.lastName}>
            {(props) => <Input {...props} value={form.lastName} onChange={set("lastName")} />}
          </Field>
          <Field label={t("email")} required error={errors.email}>
            {(props) => <Input {...props} type="email" value={form.email} onChange={set("email")} />}
          </Field>
          <Field label={t("phone")} required error={errors.phone}>
            {(props) => <Input {...props} type="tel" value={form.phone} onChange={set("phone")} />}
          </Field>
        </fieldset>

        <fieldset className="grid gap-5 border-t border-line pt-6 sm:grid-cols-2">
          <legend className="mb-4 text-sm font-semibold">{t("bookingTitle")}</legend>
          <Field label={t("status")} error={errors.status}>
            {(props) => (
              <Select {...props} value={form.status} onChange={set("status")}>
                <option value="CONFIRMED">{t("statusConfirmed")}</option>
                <option value="AWAITING_PAYMENT">{t("statusAwaiting")}</option>
                <option value="PENDING">{t("statusPending")}</option>
              </Select>
            )}
          </Field>
          <Field label={t("language")}>
            {(props) => (
              <Select {...props} value={form.locale} onChange={set("locale")}>
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="pt">Português</option>
              </Select>
            )}
          </Field>
          <Field label={t("totalOverride")} hint={t("totalOverrideHint")} error={errors.totalOverride}>
            {(props) => <Input {...props} inputMode="decimal" value={form.totalOverride} onChange={set("totalOverride")} />}
          </Field>
          <label className="flex items-center gap-3 self-end pb-3 text-sm">
            <Switch checked={form.notifyGuest} onCheckedChange={(value) => setForm((current) => ({ ...current, notifyGuest: value }))} />
            {t("notifyGuest")}
          </label>
          <Field label={t("notes")} className="sm:col-span-2">
            {(props) => <Textarea {...props} rows={3} value={form.adminNotes} onChange={set("adminNotes")} />}
          </Field>
        </fieldset>
      </div>

      <aside className="h-fit space-y-4 rounded-2xl border border-line bg-surface p-6 xl:sticky xl:top-24">
        <h2 className="font-semibold tracking-tight">{t("summary")}</h2>
        {quote?.ok ? (
          <>
            <PriceBreakdown quote={quote.quote} />
            {form.totalOverride ? <p className="text-sm text-warning-fg">{t("overrideApplied", { total: form.totalOverride })}</p> : null}
          </>
        ) : quote && !quote.ok ? (
          <p className="text-sm text-danger-fg">{tq(quote.error.code, "maxGuests" in quote.error ? { maxGuests: quote.error.maxGuests } : {})}</p>
        ) : (
          <p className="text-sm text-ink-3">{t("summaryEmpty")}</p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={pending} disabled={!propertyId || !free}>
          {t("submit")}
        </Button>
        {quote?.ok ? <p className="text-center text-xs text-ink-3">{formatMoney(quote.quote.total, quote.quote.currency, locale)}</p> : null}
      </aside>
    </form>
  );
}
