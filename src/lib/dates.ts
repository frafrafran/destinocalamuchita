/**
 * Date-only helpers. Stay dates are plain calendar days ("YYYY-MM-DD"), never instants,
 * so every computation happens in UTC to avoid DST and server-timezone drift.
 * Ranges are half-open: [start, end). A stay from 10 to 13 occupies the nights of 10, 11 and 12.
 */

export type ISODate = string;

export const PROPERTY_TIME_ZONE = "America/Argentina/Cordoba";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isValidISODate(value: unknown): value is ISODate {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** UTC-midnight Date for a calendar day, suitable for Prisma `@db.Date` columns. */
export function toDbDate(value: ISODate): Date {
  if (!isValidISODate(value)) throw new RangeError(`Invalid date: ${value}`);
  return new Date(`${value}T00:00:00.000Z`);
}

/** Calendar day of a Date read from a `@db.Date` column (UTC midnight). */
export function fromDbDate(value: Date): ISODate {
  return value.toISOString().slice(0, 10);
}

export function addDays(value: ISODate, days: number): ISODate {
  return fromDbDate(new Date(toDbDate(value).getTime() + days * DAY_MS));
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((toDbDate(to).getTime() - toDbDate(from).getTime()) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(value: ISODate): number {
  return toDbDate(value).getUTCDay();
}

/** Every night of a stay: [checkIn, checkOut). */
export function eachNight(checkIn: ISODate, checkOut: ISODate): ISODate[] {
  const nights: ISODate[] = [];
  for (let day = checkIn; day < checkOut; day = addDays(day, 1)) nights.push(day);
  return nights;
}

/** Half-open range overlap. ISO strings compare lexicographically in date order. */
export function rangesOverlap(aStart: ISODate, aEnd: ISODate, bStart: ISODate, bEnd: ISODate): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

/** Today's calendar day where the properties are, regardless of server timezone. */
export function todayISO(timeZone: string = PROPERTY_TIME_ZONE, now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function startOfMonth(value: ISODate): ISODate {
  return `${value.slice(0, 7)}-01`;
}

export function addMonths(value: ISODate, months: number): ISODate {
  const date = toDbDate(startOfMonth(value));
  date.setUTCMonth(date.getUTCMonth() + months);
  return fromDbDate(date);
}

export function daysInMonth(value: ISODate): number {
  const date = toDbDate(startOfMonth(value));
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}
