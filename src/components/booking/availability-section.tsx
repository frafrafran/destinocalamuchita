"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCalendarLabels } from "@/components/calendar/date-range-picker";
import { RangeCalendar } from "@/components/calendar/range-calendar";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { useBookingState } from "./booking-state";

export function AvailabilitySection() {
  const t = useTranslations("booking.availability");
  const tc = useTranslations("calendar");
  const locale = useLocale() as Locale;
  const labels = useCalendarLabels();
  const state = useBookingState();

  return (
    <div>
      <div className="rounded-3xl border border-line bg-surface p-5 sm:p-8">
        <RangeCalendar
          value={state.range}
          onChange={state.setRange}
          occupied={state.occupied}
          today={state.today}
          locale={locale}
          labels={labels}
          minNights={state.minNights}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-3">
          <li className="flex items-center gap-2">
            <span aria-hidden className="grid size-5 place-items-center rounded-full border border-line-strong text-[10px] text-ink">12</span>
            {t("legendAvailable")}
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="grid size-5 place-items-center rounded-full text-[10px] text-ink-3/60 line-through">12</span>
            {t("legendBooked")}
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="grid size-5 place-items-center rounded-full bg-accent text-[10px] text-accent-ink">12</span>
            {t("legendSelected")}
          </li>
        </ul>
        {state.range.checkIn ? (
          <Button variant="ghost" size="sm" onClick={() => state.setRange({ checkIn: null, checkOut: null })}>
            {tc("clear")}
          </Button>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-ink-3">{t("minNights", { count: state.pricing.property.minNights })}</p>
    </div>
  );
}
