/**
 * Money is handled as integer cents in application code and as DECIMAL(12,2) in PostgreSQL.
 * Never do arithmetic on floats; convert at the boundary with these helpers.
 */

import type { Currency } from "@/generated/prisma/enums";

export type Cents = number;

/** Accepts Prisma.Decimal, numeric strings or numbers (major units). */
export function toCents(value: { toString(): string } | number | string | null | undefined): Cents {
  if (value === null || value === undefined || value === "") return 0;
  const text = typeof value === "number" ? value.toFixed(2) : value.toString();
  const match = /^(-)?(\d+)(?:\.(\d{1,}))?$/.exec(text.trim());
  if (!match) throw new RangeError(`Invalid money amount: ${text}`);
  const [, sign, whole, fraction = ""] = match;
  // Integer-only rounding (half up) so 0.345 never becomes 34.4999… cents.
  const roundUp = fraction.length > 2 && Number(fraction[2]) >= 5 ? 1 : 0;
  const cents = Number(whole) * 100 + Number(fraction.slice(0, 2).padEnd(2, "0")) + roundUp;
  return sign ? -cents : cents;
}

/**
 * Parses an amount typed by a person, in Argentine or international style:
 * "285.000" → 285000, "285000,50" → 285000.50, "1,250.75" → 1250.75, "$ 90.000" → 90000.
 * A single separator followed by exactly three digits is a thousands separator.
 */
export function parseMoneyInput(raw: string): Cents {
  const text = raw.replace(/[\s$]|ARS|USD/gi, "");
  if (!/^\d[\d.,]*$/.test(text)) throw new RangeError(`Invalid amount: ${raw}`);
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  // Thousands groups must be "1-3 digits" followed by groups of exactly three.
  const groupsOk = (groups: string[]) => /^\d{1,3}$/.test(groups[0]!) && groups.slice(1).every((group) => /^\d{3}$/.test(group));
  let normalized: string;
  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: the last one is the decimal separator.
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    const [integer = "", fraction = ""] = text.split(decimal);
    if (text.split(decimal).length !== 2 || !groupsOk(integer.split(thousands))) throw new RangeError(`Invalid amount: ${raw}`);
    normalized = `${integer.split(thousands).join("")}.${fraction}`;
  } else {
    const separator = lastDot !== -1 ? "." : lastComma !== -1 ? "," : null;
    if (!separator) normalized = text;
    else {
      const parts = text.split(separator);
      const isThousands = parts.length > 2 || parts[parts.length - 1]!.length === 3;
      if (isThousands && !groupsOk(parts)) throw new RangeError(`Invalid amount: ${raw}`);
      normalized = isThousands ? parts.join("") : `${parts[0]}.${parts[1]}`;
    }
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new RangeError(`Invalid amount: ${raw}`);
  return toCents(normalized);
}

/** Cents as the plain editable text shown in admin inputs ("285000", "285000.5"). */
export function centsToInput(cents: Cents): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** Cents to a decimal string Prisma accepts for Decimal columns. */
export function centsToDecimalString(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function percentOf(cents: Cents, percent: number): Cents {
  return Math.round((cents * percent) / 100);
}

const LOCALE_TAGS: Record<string, string> = { es: "es-AR", en: "en-US", pt: "pt-BR" };

export function formatMoney(cents: Cents, currency: Currency, locale = "es"): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat(LOCALE_TAGS[locale] ?? locale, {
    style: "currency",
    currency,
    currencyDisplay: currency === "ARS" ? "narrowSymbol" : "symbol",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
