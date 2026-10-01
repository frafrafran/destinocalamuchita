"use client";

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { type Locale, LOCALE_TAGS } from "@/i18n/config";
import { latestCheckOut } from "@/lib/availability";
import { type ISODate, addDays, addMonths, dayOfWeek, daysInMonth, diffDays, startOfMonth, toDbDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface RangeValue {
  checkIn: ISODate | null;
  checkOut: ISODate | null;
}

export interface RangeCalendarLabels {
  previousMonth: string;
  nextMonth: string;
  unavailable: string;
  checkoutOnly: string;
  selectedCheckIn: string;
  selectedCheckOut: string;
  tooShort: string;
}

interface Props {
  value: RangeValue;
  onChange: (value: RangeValue) => void;
  /** Occupied nights (a night is identified by its date). */
  occupied: ReadonlySet<ISODate>;
  today: ISODate;
  locale: Locale;
  labels: RangeCalendarLabels;
  minNights?: number;
  /** How far ahead guests can book. */
  horizonDays?: number;
  /** Two months side by side from `md` up, one on phones. */
  months?: 1 | 2;
  className?: string;
}

const WEEK_START: Record<Locale, number> = { es: 1, en: 0, pt: 0 };

type DayState = {
  date: ISODate;
  disabled: boolean;
  occupied: boolean;
  checkoutOnly: boolean;
  tooShort: boolean;
  isStart: boolean;
  isEnd: boolean;
  inRange: boolean;
};

export function RangeCalendar({
  value,
  onChange,
  occupied,
  today,
  locale,
  labels,
  minNights = 1,
  horizonDays = 540,
  months = 2,
  className,
}: Props) {
  const tag = LOCALE_TAGS[locale];
  const lastDay = addDays(today, horizonDays);
  const [month, setMonth] = useState<ISODate>(startOfMonth(value.checkIn ?? today));
  const [hovered, setHovered] = useState<ISODate | null>(null);
  const [focused, setFocused] = useState<ISODate>(value.checkIn ?? today);
  const buttons = useRef(new Map<ISODate, HTMLButtonElement>());
  const shouldFocus = useRef(false);

  const selectingCheckOut = Boolean(value.checkIn && !value.checkOut);
  const latest = useMemo(
    () => (value.checkIn && selectingCheckOut ? latestCheckOut(occupied, value.checkIn, horizonDays) : null),
    [occupied, value.checkIn, selectingCheckOut, horizonDays],
  );

  const weekdayNames = useMemo(() => {
    const format = new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: "UTC" });
    // 2023-01-01 was a Sunday.
    return Array.from({ length: 7 }, (_, i) => format.format(toDbDate(addDays("2023-01-01", (i + WEEK_START[locale]) % 7))));
  }, [tag, locale]);
  const dayLabel = useMemo(() => new Intl.DateTimeFormat(tag, { dateStyle: "full", timeZone: "UTC" }), [tag]);
  const monthLabel = useMemo(() => new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: "UTC" }), [tag]);

  function validCheckOut(date: ISODate): boolean {
    if (!value.checkIn || date <= value.checkIn) return false;
    if (latest !== null && date > latest) return false;
    return diffDays(value.checkIn, date) >= minNights;
  }

  function stateOf(date: ISODate): DayState {
    const isOccupied = occupied.has(date);
    const outOfRange = date < today || date > lastDay;
    let disabled = outOfRange || isOccupied;
    let checkoutOnly = false;
    let tooShort = false;

    if (selectingCheckOut && value.checkIn && !outOfRange && date > value.checkIn) {
      if (validCheckOut(date)) {
        disabled = false;
        checkoutOnly = isOccupied;
      } else if (latest === null || date <= latest) {
        // Inside the free window but below the minimum stay.
        disabled = true;
        tooShort = true;
      }
    }

    const end = value.checkOut ?? (selectingCheckOut && hovered && validCheckOut(hovered) ? hovered : null);
    return {
      date,
      disabled,
      occupied: isOccupied,
      checkoutOnly,
      tooShort,
      isStart: date === value.checkIn,
      isEnd: date === end,
      inRange: Boolean(value.checkIn && end && date > value.checkIn && date < end),
    };
  }

  function select(date: ISODate) {
    const state = stateOf(date);
    if (state.disabled) return;
    if (selectingCheckOut && value.checkIn && validCheckOut(date)) {
      onChange({ checkIn: value.checkIn, checkOut: date });
    } else {
      onChange({ checkIn: date, checkOut: null });
    }
    setFocused(date);
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next: ISODate | null = null;
    if (event.key in deltas) next = addDays(focused, deltas[event.key]!);
    else if (event.key === "PageUp") next = addMonths(focused, -1);
    else if (event.key === "PageDown") next = addMonths(focused, 1);
    else if (event.key === "Home") next = addDays(focused, -((dayOfWeek(focused) - WEEK_START[locale] + 7) % 7));
    else if (event.key === "End") next = addDays(focused, 6 - ((dayOfWeek(focused) - WEEK_START[locale] + 7) % 7));
    if (!next) return;
    event.preventDefault();
    if (next < today) next = today;
    const visibleEnd = addMonths(month, months);
    if (next < month) setMonth(startOfMonth(next));
    else if (next >= visibleEnd) setMonth(addMonths(startOfMonth(next), -(months - 1)));
    shouldFocus.current = true;
    setFocused(next);
  }

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    buttons.current.get(focused)?.focus();
  }, [focused, month]);

  const canGoBack = month > startOfMonth(today);
  const canGoForward = addMonths(month, months) <= startOfMonth(lastDay);
  const visibleMonths = Array.from({ length: months }, (_, i) => addMonths(month, i));
  const focusTarget = visibleMonths.some((m) => focused.startsWith(m.slice(0, 7))) ? focused : visibleMonths[0]!;

  return (
    <div className={cn("relative select-none", className)} onMouseLeave={() => setHovered(null)}>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between">
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, -1))}
          disabled={!canGoBack}
          aria-label={labels.previousMonth}
          className="pointer-events-auto grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-25"
        >
          <CaretLeftIcon size={16} weight="bold" />
        </button>
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, 1))}
          disabled={!canGoForward}
          aria-label={labels.nextMonth}
          className="pointer-events-auto grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-25"
        >
          <CaretRightIcon size={16} weight="bold" />
        </button>
      </div>

      <div className={cn("grid gap-8", months === 2 && "md:grid-cols-2")}>
        {visibleMonths.map((monthStart, index) => {
          const offset = (dayOfWeek(monthStart) - WEEK_START[locale] + 7) % 7;
          const days = Array.from({ length: daysInMonth(monthStart) }, (_, i) => addDays(monthStart, i));
          return (
            <div key={monthStart} className={cn(index === 1 && "hidden md:block")}>
              <p className="mb-3 h-9 text-center text-sm leading-9 font-semibold text-ink first-letter:uppercase" aria-live="polite">
                {monthLabel.format(toDbDate(monthStart))}
              </p>
              <div role="grid" aria-label={monthLabel.format(toDbDate(monthStart))} onKeyDown={moveFocus}>
                <div role="row" className="grid grid-cols-7">
                  {weekdayNames.map((name) => (
                    <span key={name} role="columnheader" className="pb-2 text-center text-[11px] font-medium text-ink-3 capitalize">
                      {name.replace(".", "")}
                    </span>
                  ))}
                </div>
                <div role="row" className="grid grid-cols-7 gap-y-1">
                  {Array.from({ length: offset }, (_, i) => (
                    <span key={`pad-${i}`} role="gridcell" aria-hidden />
                  ))}
                  {days.map((date) => {
                    const day = stateOf(date);
                    const edge = day.isStart || day.isEnd;
                    const band = day.inRange || (day.isStart && (value.checkOut || (hovered && validCheckOut(hovered)))) || (day.isEnd && value.checkIn);
                    const description = [
                      day.isStart ? labels.selectedCheckIn : null,
                      day.isEnd ? labels.selectedCheckOut : null,
                      day.checkoutOnly ? labels.checkoutOnly : null,
                      day.tooShort ? labels.tooShort : null,
                      day.occupied && !day.checkoutOnly ? labels.unavailable : null,
                    ]
                      .filter(Boolean)
                      .join(". ");
                    return (
                      <div
                        key={date}
                        role="gridcell"
                        aria-selected={edge || day.inRange}
                        className={cn(
                          "relative flex h-11 items-center justify-center",
                          band && "before:absolute before:inset-y-0.5 before:bg-accent-soft",
                          band && day.inRange && "before:inset-x-0",
                          band && day.isStart && "before:right-0 before:left-1/2",
                          band && day.isEnd && "before:right-1/2 before:left-0",
                        )}
                      >
                        <button
                          ref={(node) => {
                            if (node) buttons.current.set(date, node);
                            else buttons.current.delete(date);
                          }}
                          type="button"
                          tabIndex={date === focusTarget ? 0 : -1}
                          aria-disabled={day.disabled || undefined}
                          aria-label={`${dayLabel.format(toDbDate(date))}${description ? `. ${description}` : ""}`}
                          title={day.tooShort ? labels.tooShort : day.checkoutOnly ? labels.checkoutOnly : undefined}
                          onClick={() => select(date)}
                          onMouseEnter={() => selectingCheckOut && setHovered(date)}
                          onFocus={() => setFocused(date)}
                          className={cn(
                            "tabular relative z-10 grid size-10 place-items-center rounded-full text-sm transition-[background-color,color,transform] duration-150",
                            edge
                              ? "bg-accent font-semibold text-accent-ink shadow-soft"
                              : day.disabled
                                ? "cursor-default text-ink-3/60"
                                : "text-ink hover:bg-surface-3 active:scale-95",
                            day.occupied && !day.checkoutOnly && !edge && "line-through decoration-ink-3/60",
                            day.checkoutOnly && !edge && "text-ink-2 italic",
                            date === today && !edge && "font-semibold underline decoration-accent decoration-2 underline-offset-4",
                          )}
                        >
                          {Number(date.slice(8))}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
