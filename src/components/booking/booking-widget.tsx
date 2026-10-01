"use client";

import { CalendarBlankIcon, InfoIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { DateRangePicker, useFormatDay } from "@/components/calendar/date-range-picker";
import { buttonClasses } from "@/components/ui/button";
import { Counter, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/primitives";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { fromPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useBookingState } from "./booking-state";
import { PriceBreakdown } from "./price-breakdown";

function useQuoteMessage() {
  const t = useTranslations("booking.widget");
  const tq = useTranslations("quoteErrors");
  const state = useBookingState();
  if (!state.range.checkIn) return t("pickDates");
  if (!state.range.checkOut) return t("pickCheckOut");
  if (!state.available) return t("unavailable");
  if (state.quote && !state.quote.ok) {
    const { code, ...values } = state.quote.error;
    return tq(code, values);
  }
  return null;
}

export function BookingWidget() {
  const t = useTranslations("booking.widget");
  const locale = useLocale();
  const state = useBookingState();
  const formatDay = useFormatDay();
  const message = useQuoteMessage();
  const { pricing } = state;
  const quote = state.quote?.ok ? state.quote.quote : null;

  return (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-lift">
      <p className="text-ink-3">
        {quote ? (
          <>
            <span className="tabular text-2xl font-semibold tracking-tight text-ink">{formatMoney(quote.averageNightly, pricing.property.currency, locale)}</span>{" "}
            {t("perNightAverage")}
          </>
        ) : (
          <>
            {t("from")}{" "}
            <span className="tabular text-2xl font-semibold tracking-tight text-ink">{formatMoney(fromPrice(pricing), pricing.property.currency, locale)}</span>{" "}
            {t("perNight")}
          </>
        )}
      </p>

      <div className="mt-5 overflow-hidden rounded-2xl border border-line-strong">
        <DateRangePicker
          value={state.range}
          onChange={state.setRange}
          today={state.today}
          occupied={state.occupied}
          minNights={state.minNights}
          align="end"
          trigger={(open) => (
            <button type="button" className={cn("grid w-full grid-cols-2 text-left transition-colors hover:bg-surface-2", open && "bg-surface-2")}>
              <span className="border-r border-line-strong px-4 py-3">
                <span className="block text-[11px] font-semibold tracking-wide text-ink-2 uppercase">{t("checkIn")}</span>
                <span className={cn("mt-0.5 block text-[15px]", state.range.checkIn ? "text-ink" : "text-ink-3")}>
                  {state.range.checkIn ? formatDay(state.range.checkIn) : t("addDate")}
                </span>
              </span>
              <span className="px-4 py-3">
                <span className="block text-[11px] font-semibold tracking-wide text-ink-2 uppercase">{t("checkOut")}</span>
                <span className={cn("mt-0.5 block text-[15px]", state.range.checkOut ? "text-ink" : "text-ink-3")}>
                  {state.range.checkOut ? formatDay(state.range.checkOut) : t("addDate")}
                </span>
              </span>
            </button>
          )}
        />
        <Popover>
          <PopoverTrigger className="w-full border-t border-line-strong px-4 py-3 text-left transition-colors hover:bg-surface-2 data-[state=open]:bg-surface-2">
            <span className="block text-[11px] font-semibold tracking-wide text-ink-2 uppercase">{t("guests")}</span>
            <span className="mt-0.5 block text-[15px]">{t("guestsCount", { count: state.guests })}</span>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{t("guests")}</p>
                <p className="text-xs text-ink-3">{t("maxGuests", { count: pricing.property.maxGuests })}</p>
              </div>
              <Counter
                value={state.guests}
                min={1}
                max={pricing.property.maxGuests}
                onChange={state.setGuests}
                decrementLabel={t("fewerGuests")}
                incrementLabel={t("moreGuests")}
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {state.bookingHref ? (
        <Link href={state.bookingHref} className={buttonClasses({ size: "lg", className: "mt-5 w-full" })}>
          {t("reserve")}
        </Link>
      ) : (
        <button type="button" disabled className={buttonClasses({ size: "lg", className: "mt-5 w-full" })}>
          {t("reserve")}
        </button>
      )}

      {message ? (
        <p className="mt-3 flex items-start justify-center gap-1.5 text-center text-sm text-ink-3" role="status">
          {state.range.checkOut && (!state.available || (state.quote && !state.quote.ok)) ? <InfoIcon size={16} className="mt-0.5 shrink-0 text-warning-fg" /> : <CalendarBlankIcon size={16} className="mt-0.5 shrink-0" />}
          {message}
        </p>
      ) : (
        <p className="mt-3 text-center text-sm text-ink-3">{t("noChargeYet")}</p>
      )}

      {quote && state.available ? <PriceBreakdown quote={quote} className="mt-6" /> : null}

      <p className="mt-6 flex items-start gap-2.5 border-t border-line pt-5 text-xs leading-relaxed text-ink-3">
        <ShieldCheckIcon size={18} className="shrink-0 text-accent-text" />
        {t("trust")}
      </p>
    </div>
  );
}

/** Fixed bottom bar on phones. */
export function MobileBookingBar() {
  const t = useTranslations("booking.widget");
  const locale = useLocale();
  const state = useBookingState();
  const formatDay = useFormatDay();
  const quote = state.quote?.ok ? state.quote.quote : null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          {quote && state.available ? (
            <>
              <p className="tabular font-semibold">{formatMoney(quote.total, quote.currency, locale)}</p>
              <p className="truncate text-xs text-ink-3">
                {formatDay(state.range.checkIn!)} - {formatDay(state.range.checkOut!)}, {t("guestsCount", { count: state.guests })}
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-3">
              {t("from")} <span className="tabular font-semibold text-ink">{formatMoney(fromPrice(state.pricing), state.pricing.property.currency, locale)}</span> {t("perNight")}
            </p>
          )}
        </div>
        {state.bookingHref ? (
          <Link href={state.bookingHref} className={buttonClasses({ className: "shrink-0" })}>
            {t("reserve")}
          </Link>
        ) : (
          <a href="#disponibilidad" className={buttonClasses({ variant: "secondary", className: "shrink-0" })}>
            {t("chooseDates")}
          </a>
        )}
      </div>
    </div>
  );
}
