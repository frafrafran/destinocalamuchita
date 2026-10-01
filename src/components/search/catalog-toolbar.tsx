"use client";

import { CalendarBlankIcon, FadersHorizontalIcon, MagnifyingGlassIcon, UsersIcon, XIcon } from "@phosphor-icons/react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import { AmenityIcon } from "@/components/amenity-icon";
import { DateRangePicker, useFormatDay } from "@/components/calendar/date-range-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DrawerContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { Counter, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/primitives";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { ISODate } from "@/lib/dates";
import { PROPERTY_TYPES, SORT_KEYS } from "@/lib/search-params";
import { cn } from "@/lib/utils";

interface Facets {
  cities: { city: string; count: number }[];
  amenities: { key: string; label: string; icon: string }[];
}

const pill =
  "inline-flex h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-medium text-ink-2 transition-colors hover:border-ink-3 hover:text-ink data-[active=true]:border-ink data-[active=true]:text-ink";

export function CatalogToolbar({ facets, today, resultsSlot }: { facets: Facets; today: ISODate; resultsSlot: ReactNode }) {
  const t = useTranslations("search");
  const tAmenities = useTranslations("amenities");
  const tTypes = useTranslations("propertyTypes");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const formatDay = useFormatDay();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`, { scroll: false }));
  }

  const checkIn = params.get("checkIn");
  const checkOut = params.get("checkOut");
  const guests = Number(params.get("guests") ?? 0) || 0;
  const amenities = (params.get("amenities") ?? "").split(",").filter(Boolean);
  const advancedCount = ["type", "bedrooms", "priceMin", "priceMax"].filter((key) => params.get(key)).length + amenities.length;
  const hasAnyFilter = [...params.keys()].some((key) => key !== "sort");

  const amenityLabel = (key: string, fallback: string) => (tAmenities.has(key) ? tAmenities(key) : fallback);

  return (
    <>
      <div className="sticky top-[68px] z-30 -mx-4 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <div className="flex flex-wrap items-center gap-2">
          <form
            role="search"
            className="relative min-w-0 flex-1 basis-full sm:basis-60 sm:flex-none"
            onSubmit={(event) => {
              event.preventDefault();
              update({ q: q.trim() || null });
            }}
          >
            <MagnifyingGlassIcon size={17} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" />
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onBlur={() => q.trim() !== (params.get("q") ?? "") && update({ q: q.trim() || null })}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="h-11 rounded-full pl-10"
            />
          </form>

          <Select
            aria-label={t("destination")}
            value={params.get("city") ?? ""}
            onChange={(event) => update({ city: event.target.value || null })}
            className="h-11 w-auto rounded-full pr-9 text-sm font-medium"
          >
            <option value="">{t("anyDestination")}</option>
            {facets.cities.map(({ city, count }) => (
              <option key={city} value={city}>
                {city} ({count})
              </option>
            ))}
          </Select>

          <DateRangePicker
            value={{ checkIn, checkOut }}
            onChange={(range) => {
              if (range.checkIn && range.checkOut) update({ checkIn: range.checkIn, checkOut: range.checkOut });
              else if (!range.checkIn) update({ checkIn: null, checkOut: null });
            }}
            today={today}
            trigger={() => (
              <button type="button" className={pill} data-active={Boolean(checkIn)}>
                <CalendarBlankIcon size={17} />
                {checkIn && checkOut ? `${formatDay(checkIn)} - ${formatDay(checkOut)}` : t("dates")}
              </button>
            )}
          />

          <Popover>
            <PopoverTrigger className={pill} data-active={guests > 0}>
              <UsersIcon size={17} />
              {guests ? t("guestsCount", { count: guests }) : t("guests")}
            </PopoverTrigger>
            <PopoverContent className="w-72">
              <div className="flex items-center justify-between gap-4">
                <p className="font-medium">{t("guests")}</p>
                <Counter
                  value={guests || 1}
                  min={1}
                  max={16}
                  onChange={(value) => update({ guests: String(value) })}
                  decrementLabel={t("fewerGuests")}
                  incrementLabel={t("moreGuests")}
                />
              </div>
            </PopoverContent>
          </Popover>

          <Dialog>
            <DialogTrigger className={pill} data-active={advancedCount > 0}>
              <FadersHorizontalIcon size={17} />
              {t("filters")}
              {advancedCount ? (
                <span className="tabular grid size-5 place-items-center rounded-full bg-ink text-[11px] text-bg">{advancedCount}</span>
              ) : null}
            </DialogTrigger>
            <DrawerContent
              title={t("filters")}
              closeLabel={t("closeFilters")}
              footer={
                <Button
                  variant="ghost"
                  className="mr-auto"
                  onClick={() => update({ type: null, bedrooms: null, priceMin: null, priceMax: null, amenities: null })}
                >
                  {t("clearFilters")}
                </Button>
              }
            >
              <div className="space-y-8">
                <fieldset>
                  <legend className="text-sm font-semibold">{t("type")}</legend>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {PROPERTY_TYPES.map((type) => {
                      const active = params.get("type") === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          aria-pressed={active}
                          onClick={() => update({ type: active ? null : type })}
                          className={cn(pill, "h-10")}
                          data-active={active}
                        >
                          {tTypes(type)}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="text-sm font-semibold">{t("bedrooms")}</legend>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[null, "1", "2", "3", "4"].map((value) => {
                      const active = (params.get("bedrooms") ?? null) === value;
                      return (
                        <button
                          key={value ?? "any"}
                          type="button"
                          aria-pressed={active}
                          onClick={() => update({ bedrooms: value })}
                          className={cn(pill, "h-10 min-w-12 justify-center")}
                          data-active={active}
                        >
                          {value === null ? t("any") : `${value}+`}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="text-sm font-semibold">{t("pricePerNight")}</legend>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5 text-xs text-ink-3">
                      {t("minimum")}
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1000}
                        defaultValue={params.get("priceMin") ?? ""}
                        onBlur={(event) => update({ priceMin: event.target.value || null })}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs text-ink-3">
                      {t("maximum")}
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1000}
                        defaultValue={params.get("priceMax") ?? ""}
                        onBlur={(event) => update({ priceMax: event.target.value || null })}
                      />
                    </label>
                  </div>
                </fieldset>

                {facets.amenities.length ? (
                  <fieldset>
                    <legend className="text-sm font-semibold">{t("amenities")}</legend>
                    <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {facets.amenities.map((amenity) => {
                        const active = amenities.includes(amenity.key);
                        return (
                          <button
                            key={amenity.key}
                            type="button"
                            aria-pressed={active}
                            onClick={() => {
                              const next = active ? amenities.filter((key) => key !== amenity.key) : [...amenities, amenity.key];
                              update({ amenities: next.join(",") || null });
                            }}
                            className={cn(
                              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                              active ? "bg-accent-soft font-medium text-accent-text" : "text-ink-2 hover:bg-surface-2",
                            )}
                          >
                            <AmenityIcon name={amenity.icon} size={18} />
                            {amenityLabel(amenity.key, amenity.label)}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ) : null}
              </div>
            </DrawerContent>
          </Dialog>

          <div className="ml-auto flex items-center gap-2">
            {hasAnyFilter ? (
              <Button variant="ghost" size="sm" onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}>
                <XIcon size={14} />
                {t("clearAll")}
              </Button>
            ) : null}
            <Select
              aria-label={t("sortBy")}
              value={params.get("sort") ?? "recommended"}
              onChange={(event) => update({ sort: event.target.value === "recommended" ? null : event.target.value })}
              className="h-11 w-auto rounded-full pr-9 text-sm"
            >
              {SORT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`sort.${key}`)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>
      <div aria-busy={pending} className={cn("transition-opacity duration-200", pending && "pointer-events-none opacity-50")}>
        {resultsSlot}
      </div>
    </>
  );
}
