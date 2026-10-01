"use client";

import { CalendarBlankIcon, MagnifyingGlassIcon, MapPinIcon, UsersIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { forwardRef, type ComponentProps, useState } from "react";
import { DateRangePicker, useFormatDay } from "@/components/calendar/date-range-picker";
import type { RangeValue } from "@/components/calendar/range-calendar";
import { Button } from "@/components/ui/button";
import { Counter, Menu, MenuContent, MenuItem, MenuTrigger, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/primitives";
import { useRouter } from "@/i18n/navigation";
import type { ISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";

const Segment = forwardRef<HTMLButtonElement, ComponentProps<"button"> & { icon: React.ReactNode; label: string; value: string; empty: boolean }>(
  function Segment({ icon, label, value, empty, className, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          "group flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-surface-2 md:rounded-full md:px-6",
          "data-[state=open]:bg-surface-2",
          className,
        )}
        {...props}
      >
        <span className="text-ink-3 transition-colors group-hover:text-ink-2">{icon}</span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold tracking-wide text-ink-2 uppercase">{label}</span>
          <span className={cn("block truncate text-[15px]", empty ? "text-ink-3" : "font-medium text-ink")}>{value}</span>
        </span>
      </button>
    );
  },
);

export function HeroSearch({ cities, today }: { cities: string[]; today: ISODate }) {
  const t = useTranslations("search");
  const router = useRouter();
  const formatDay = useFormatDay();
  const [city, setCity] = useState<string | null>(null);
  const [range, setRange] = useState<RangeValue>({ checkIn: null, checkOut: null });
  const [guests, setGuests] = useState(2);

  function submit() {
    const params = new URLSearchParams();
    if (city) params.set("city", city);
    if (range.checkIn && range.checkOut) {
      params.set("checkIn", range.checkIn);
      params.set("checkOut", range.checkOut);
    }
    params.set("guests", String(guests));
    router.push(`/propiedades?${params.toString()}`);
  }

  const datesValue =
    range.checkIn && range.checkOut
      ? `${formatDay(range.checkIn)} - ${formatDay(range.checkOut)}`
      : range.checkIn
        ? `${formatDay(range.checkIn)} - ${t("checkOut")}`
        : t("addDates");

  return (
    <form
      role="search"
      aria-label={t("label")}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex w-full flex-col gap-1 rounded-3xl bg-surface p-2 text-ink shadow-float md:flex-row md:items-center md:rounded-full"
    >
      <Menu>
        <MenuTrigger asChild>
          <Segment icon={<MapPinIcon size={20} />} label={t("destination")} value={city ?? t("anyDestination")} empty={!city} />
        </MenuTrigger>
        <MenuContent align="start" className="w-64">
          <MenuItem onSelect={() => setCity(null)}>{t("anyDestination")}</MenuItem>
          {cities.map((name) => (
            <MenuItem key={name} onSelect={() => setCity(name)} className={cn(name === city && "font-semibold text-ink")}>
              {name}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>

      <span aria-hidden className="hidden h-8 w-px bg-line md:block" />

      <DateRangePicker
        value={range}
        onChange={setRange}
        today={today}
        align="center"
        trigger={() => <Segment icon={<CalendarBlankIcon size={20} />} label={t("dates")} value={datesValue} empty={!range.checkIn} />}
      />

      <span aria-hidden className="hidden h-8 w-px bg-line md:block" />

      <Popover>
        <PopoverTrigger asChild>
          <Segment icon={<UsersIcon size={20} />} label={t("guests")} value={t("guestsCount", { count: guests })} empty={false} />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{t("guests")}</p>
              <p className="text-xs text-ink-3">{t("guestsHint")}</p>
            </div>
            <Counter value={guests} min={1} max={16} onChange={setGuests} decrementLabel={t("fewerGuests")} incrementLabel={t("moreGuests")} />
          </div>
        </PopoverContent>
      </Popover>

      <Button type="submit" size="lg" className="mt-1 h-14 md:mt-0 md:ml-1 md:h-14 md:px-7">
        <MagnifyingGlassIcon size={18} weight="bold" />
        {t("submit")}
      </Button>
    </form>
  );
}
