/**
 * Pure availability logic shared by the calendars (client) and the booking service (server).
 * A "blocked range" is anything that occupies nights: a reservation, a manual block or an
 * event imported from another channel. Ranges are half-open [start, end).
 */

import { type ISODate, addDays, eachNight, maxDate, minDate, rangesOverlap } from "./dates";

export type BlockKind = "RESERVATION" | "BLOCK" | "EXTERNAL";

export interface BlockedRange {
  start: ISODate;
  end: ISODate;
  kind: BlockKind;
}

export function findConflicts<T extends BlockedRange>(ranges: readonly T[], checkIn: ISODate, checkOut: ISODate): T[] {
  return ranges.filter((range) => rangesOverlap(range.start, range.end, checkIn, checkOut));
}

/** Set of occupied nights between `from` (inclusive) and `to` (exclusive). */
export function occupiedNights(ranges: readonly BlockedRange[], from: ISODate, to: ISODate): Set<ISODate> {
  const nights = new Set<ISODate>();
  for (const range of ranges) {
    const start = maxDate(range.start, from);
    const end = minDate(range.end, to);
    if (start >= end) continue;
    for (const night of eachNight(start, end)) nights.add(night);
  }
  return nights;
}

/** A guest can arrive on `date` if that night is free. */
export function canCheckIn(occupied: ReadonlySet<ISODate>, date: ISODate): boolean {
  return !occupied.has(date);
}

/**
 * Latest possible departure for a given arrival: the first occupied night after check-in
 * (guests may leave the morning another stay begins). Returns null when nothing blocks
 * within `horizon` nights.
 */
export function latestCheckOut(occupied: ReadonlySet<ISODate>, checkIn: ISODate, horizon: number): ISODate | null {
  for (let i = 1; i <= horizon; i++) {
    const night = addDays(checkIn, i);
    if (occupied.has(night)) return night;
  }
  return null;
}

/** Whether [checkIn, checkOut) is entirely free. */
export function canStay(occupied: ReadonlySet<ISODate>, checkIn: ISODate, checkOut: ISODate): boolean {
  if (checkOut <= checkIn) return false;
  return eachNight(checkIn, checkOut).every((night) => !occupied.has(night));
}
