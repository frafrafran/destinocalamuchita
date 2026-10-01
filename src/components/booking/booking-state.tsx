"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import type { RangeValue } from "@/components/calendar/range-calendar";
import { type BlockedRange, canStay, occupiedNights } from "@/lib/availability";
import { type ISODate, addDays } from "@/lib/dates";
import { type PricingConfig, type QuoteResult, calculateQuote, minNightsFor } from "@/lib/pricing";

interface BookingState {
  range: RangeValue;
  setRange: (range: RangeValue) => void;
  guests: number;
  setGuests: (guests: number) => void;
  occupied: ReadonlySet<ISODate>;
  today: ISODate;
  pricing: PricingConfig;
  minNights: number;
  /** Null until both dates are chosen. */
  quote: QuoteResult | null;
  available: boolean;
  bookingHref: string | null;
}

const Context = createContext<BookingState | null>(null);

/**
 * Shared by the booking card, the mobile bar and the availability calendar on the property page.
 * Quotes use the same pure engine the server runs when the reservation is created.
 */
export function BookingStateProvider({
  children,
  blocked,
  pricing,
  today,
  slug,
  initial,
  horizonDays,
}: {
  children: ReactNode;
  blocked: BlockedRange[];
  pricing: PricingConfig;
  today: ISODate;
  slug: string;
  initial: { checkIn?: ISODate; checkOut?: ISODate; guests?: number };
  horizonDays: number;
}) {
  const occupied = useMemo(() => occupiedNights(blocked, today, addDays(today, horizonDays)), [blocked, today, horizonDays]);
  const initialRange =
    initial.checkIn && initial.checkOut && initial.checkIn >= today && canStay(occupied, initial.checkIn, initial.checkOut)
      ? { checkIn: initial.checkIn, checkOut: initial.checkOut }
      : { checkIn: null, checkOut: null };
  const [range, setRange] = useState<RangeValue>(initialRange);
  const [guests, setGuests] = useState(Math.min(Math.max(initial.guests ?? 2, 1), pricing.property.maxGuests));

  const value = useMemo<BookingState>(() => {
    const complete = range.checkIn && range.checkOut;
    const quote = complete ? calculateQuote({ checkIn: range.checkIn!, checkOut: range.checkOut!, guests, today }, pricing) : null;
    const available = complete ? canStay(occupied, range.checkIn!, range.checkOut!) : false;
    const bookingHref =
      complete && quote?.ok && available
        ? `/reservar/${slug}?${new URLSearchParams({ checkIn: range.checkIn!, checkOut: range.checkOut!, guests: String(guests) }).toString()}`
        : null;
    return {
      range,
      setRange,
      guests,
      setGuests,
      occupied,
      today,
      pricing,
      minNights: range.checkIn ? minNightsFor(range.checkIn, pricing) : pricing.property.minNights,
      quote,
      available,
      bookingHref,
    };
  }, [range, guests, occupied, today, pricing, slug]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useBookingState(): BookingState {
  const value = useContext(Context);
  if (!value) throw new Error("useBookingState must be used inside BookingStateProvider");
  return value;
}
