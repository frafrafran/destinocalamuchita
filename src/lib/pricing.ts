/**
 * Pure price engine. Given a property's pricing configuration and a stay, returns a quote
 * (or a validation error). Used identically by the booking widget preview and by the server
 * when a reservation is created, so the guest always sees the price the server will charge.
 *
 * Nightly price precedence: special date > season (weekend variant if set) > property weekend > base.
 * Weekend nights are Friday and Saturday nights.
 */

import type { Currency, FeeUnit } from "@/generated/prisma/enums";
import { type ISODate, dayOfWeek, diffDays, eachNight, isValidISODate } from "./dates";
import { type Cents, percentOf } from "./money";

export const MAX_STAY_NIGHTS = 365;

export interface PricingProperty {
  currency: Currency;
  basePrice: Cents;
  weekendPrice: Cents | null;
  cleaningFee: Cents;
  minNights: number;
  maxNights: number | null;
  maxGuests: number;
}

export interface PricingSeason {
  id: string;
  name: string;
  startDate: ISODate;
  /** Exclusive. */
  endDate: ISODate;
  nightlyPrice: Cents;
  weekendPrice: Cents | null;
  minNights: number | null;
}

export type PricingRule =
  | { id: string; type: "SPECIAL_DATE"; name: string; startDate: ISODate; endDate: ISODate; amount: Cents }
  | { id: string; type: "LENGTH_DISCOUNT"; name: string; minNights: number; percent: number }
  | { id: string; type: "FEE"; name: string; amount: Cents; feeUnit: FeeUnit };

export interface PricingConfig {
  property: PricingProperty;
  seasons: PricingSeason[];
  rules: PricingRule[];
}

export type NightKind = "BASE" | "WEEKEND" | "SEASON" | "SPECIAL";

export interface QuoteNight {
  date: ISODate;
  price: Cents;
  kind: NightKind;
  label: string | null;
}

export interface QuoteFee {
  name: string;
  unit: FeeUnit;
  amount: Cents;
}

export interface Quote {
  currency: Currency;
  checkIn: ISODate;
  checkOut: ISODate;
  guests: number;
  nights: number;
  nightly: QuoteNight[];
  nightlySubtotal: Cents;
  discount: { name: string; percent: number; amount: Cents } | null;
  fees: QuoteFee[];
  feesTotal: Cents;
  cleaningFee: Cents;
  total: Cents;
  averageNightly: Cents;
}

export type QuoteError =
  | { code: "INVALID_DATES" }
  | { code: "PAST_DATE" }
  | { code: "MIN_NIGHTS"; minNights: number }
  | { code: "MAX_NIGHTS"; maxNights: number }
  | { code: "INVALID_GUESTS" }
  | { code: "MAX_GUESTS"; maxGuests: number };

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; error: QuoteError };

export interface QuoteRequest {
  checkIn: ISODate;
  checkOut: ISODate;
  guests: number;
  /** Today in the property's timezone; stays cannot start before it. */
  today: ISODate;
}

function inRange(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date < end;
}

function isWeekendNight(date: ISODate): boolean {
  const day = dayOfWeek(date);
  return day === 5 || day === 6;
}

function priceForNight(date: ISODate, config: PricingConfig): QuoteNight {
  const special = config.rules.find(
    (rule): rule is Extract<PricingRule, { type: "SPECIAL_DATE" }> =>
      rule.type === "SPECIAL_DATE" && inRange(date, rule.startDate, rule.endDate),
  );
  if (special) return { date, price: special.amount, kind: "SPECIAL", label: special.name };

  const weekend = isWeekendNight(date);
  const season = config.seasons.find((s) => inRange(date, s.startDate, s.endDate));
  if (season) {
    const price = weekend && season.weekendPrice !== null ? season.weekendPrice : season.nightlyPrice;
    return { date, price, kind: "SEASON", label: season.name };
  }

  if (weekend && config.property.weekendPrice !== null) {
    return { date, price: config.property.weekendPrice, kind: "WEEKEND", label: null };
  }
  return { date, price: config.property.basePrice, kind: "BASE", label: null };
}

/** Minimum stay for a check-in date: the stricter of the property and the season it starts in. */
export function minNightsFor(checkIn: ISODate, config: PricingConfig): number {
  const season = config.seasons.find((s) => inRange(checkIn, s.startDate, s.endDate));
  return Math.max(config.property.minNights, season?.minNights ?? 0, 1);
}

function feeAmount(fee: Extract<PricingRule, { type: "FEE" }>, nights: number, guests: number): Cents {
  switch (fee.feeUnit) {
    case "PER_STAY":
      return fee.amount;
    case "PER_NIGHT":
      return fee.amount * nights;
    case "PER_GUEST":
      return fee.amount * guests;
    case "PER_GUEST_NIGHT":
      return fee.amount * guests * nights;
  }
}

export function calculateQuote(request: QuoteRequest, config: PricingConfig): QuoteResult {
  const { checkIn, checkOut, guests, today } = request;

  if (!isValidISODate(checkIn) || !isValidISODate(checkOut) || checkOut <= checkIn) {
    return { ok: false, error: { code: "INVALID_DATES" } };
  }
  if (checkIn < today) return { ok: false, error: { code: "PAST_DATE" } };

  const nights = diffDays(checkIn, checkOut);
  const minNights = minNightsFor(checkIn, config);
  if (nights < minNights) return { ok: false, error: { code: "MIN_NIGHTS", minNights } };
  const maxNights = Math.min(config.property.maxNights ?? MAX_STAY_NIGHTS, MAX_STAY_NIGHTS);
  if (nights > maxNights) return { ok: false, error: { code: "MAX_NIGHTS", maxNights } };

  if (!Number.isInteger(guests) || guests < 1) return { ok: false, error: { code: "INVALID_GUESTS" } };
  if (guests > config.property.maxGuests) {
    return { ok: false, error: { code: "MAX_GUESTS", maxGuests: config.property.maxGuests } };
  }

  const nightly = eachNight(checkIn, checkOut).map((date) => priceForNight(date, config));
  const nightlySubtotal = nightly.reduce((sum, night) => sum + night.price, 0);

  const bestDiscount = config.rules
    .filter(
      (rule): rule is Extract<PricingRule, { type: "LENGTH_DISCOUNT" }> =>
        rule.type === "LENGTH_DISCOUNT" && nights >= rule.minNights && rule.percent > 0,
    )
    .sort((a, b) => b.percent - a.percent)[0];
  const discount = bestDiscount
    ? {
        name: bestDiscount.name,
        percent: Math.min(bestDiscount.percent, 100),
        amount: percentOf(nightlySubtotal, Math.min(bestDiscount.percent, 100)),
      }
    : null;

  const fees = config.rules
    .filter((rule): rule is Extract<PricingRule, { type: "FEE" }> => rule.type === "FEE")
    .map((fee) => ({ name: fee.name, unit: fee.feeUnit, amount: feeAmount(fee, nights, guests) }))
    .filter((fee) => fee.amount > 0);
  const feesTotal = fees.reduce((sum, fee) => sum + fee.amount, 0);
  const cleaningFee = config.property.cleaningFee;
  const total = nightlySubtotal - (discount?.amount ?? 0) + feesTotal + cleaningFee;

  return {
    ok: true,
    quote: {
      currency: config.property.currency,
      checkIn,
      checkOut,
      guests,
      nights,
      nightly,
      nightlySubtotal,
      discount,
      fees,
      feesTotal,
      cleaningFee,
      total,
      averageNightly: Math.round(nightlySubtotal / nights),
    },
  };
}

/** Lowest nightly price the property can have, used for "from $X / night" labels. */
export function fromPrice(config: PricingConfig): Cents {
  const candidates = [
    config.property.basePrice,
    ...(config.property.weekendPrice !== null ? [config.property.weekendPrice] : []),
  ];
  return Math.min(...candidates);
}
