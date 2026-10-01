"use client";

import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/primitives";
import type { Locale } from "@/i18n/config";
import { type ISODate, diffDays, toDbDate } from "@/lib/dates";
import { useMediaQuery } from "@/lib/use-media-query";
import { RangeCalendar, type RangeValue } from "./range-calendar";

const EMPTY = new Set<ISODate>();

export function useCalendarLabels() {
  const t = useTranslations("calendar");
  return {
    previousMonth: t("previousMonth"),
    nextMonth: t("nextMonth"),
    unavailable: t("unavailable"),
    checkoutOnly: t("checkoutOnly"),
    selectedCheckIn: t("selectedCheckIn"),
    selectedCheckOut: t("selectedCheckOut"),
    tooShort: t("tooShort"),
  };
}

export function useFormatDay() {
  const locale = useLocale();
  return useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
    return (date: ISODate) => format.format(toDbDate(date));
  }, [locale]);
}

interface Props {
  value: RangeValue;
  onChange: (value: RangeValue) => void;
  today: ISODate;
  occupied?: ReadonlySet<ISODate>;
  minNights?: number;
  /** Render prop for the trigger; receives whether the picker is open. */
  trigger: (open: boolean) => ReactNode;
  align?: "start" | "center" | "end";
}

/** Popover on desktop, bottom sheet on phones. */
export function DateRangePicker({ value, onChange, today, occupied = EMPTY, minNights = 1, trigger, align = "start" }: Props) {
  const t = useTranslations("calendar");
  const locale = useLocale() as Locale;
  const labels = useCalendarLabels();
  const desktop = useMediaQuery("(min-width: 768px)");
  const [open, setOpen] = useState(false);
  const nights = value.checkIn && value.checkOut ? diffDays(value.checkIn, value.checkOut) : 0;

  const calendar = (
    <RangeCalendar
      value={value}
      onChange={(next) => {
        onChange(next);
        if (desktop && next.checkIn && next.checkOut) setOpen(false);
      }}
      occupied={occupied}
      today={today}
      locale={locale}
      labels={labels}
      minNights={minNights}
      months={desktop ? 2 : 1}
    />
  );

  const footer = (
    <div className="flex w-full items-center justify-between gap-3">
      <p className="text-sm text-ink-3" aria-live="polite">
        {nights > 0 ? t("nights", { count: nights }) : value.checkIn ? t("pickCheckOut") : t("pickCheckIn")}
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => onChange({ checkIn: null, checkOut: null })} disabled={!value.checkIn}>
          {t("clear")}
        </Button>
        <Button size="sm" onClick={() => setOpen(false)}>
          {t("done")}
        </Button>
      </div>
    </div>
  );

  if (desktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger(open)}</PopoverTrigger>
        <PopoverContent align={align} className="w-[min(720px,calc(100vw-2rem))] p-6">
          {calendar}
          <div className="mt-5 border-t border-line pt-4">{footer}</div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger(open)}</DialogTrigger>
      <DialogContent title={t("title")} closeLabel={t("close")} footer={footer}>
        {calendar}
      </DialogContent>
    </Dialog>
  );
}
