import type { CalendarChannel, CalendarEventKind } from "@/generated/prisma/enums";

/**
 * Per-channel knowledge. Every channel syncs through standard iCal; adapters only interpret the
 * event summaries so the calendar can tell a guest booking from an owner block.
 * Adding a channel = adding an enum value + an entry here.
 */
export interface ChannelAdapter {
  label: string;
  classify(summary: string): CalendarEventKind;
}

const BLOCK_WORDS = /not available|no disponible|n[ãa]o dispon[ií]vel|blocked|bloquead|closed|cerrad/i;

const byKeywords: ChannelAdapter["classify"] = (summary) => (BLOCK_WORDS.test(summary) ? "BLOCKED" : "BOOKING");

export const CHANNELS: Record<CalendarChannel, ChannelAdapter> = {
  // Airbnb: "Reserved" for bookings, "Airbnb (Not available)" for blocked nights.
  AIRBNB: { label: "Airbnb", classify: byKeywords },
  // Booking.com: "CLOSED - Not available" for closed dates, guest name or "Booking" otherwise.
  BOOKING: { label: "Booking.com", classify: byKeywords },
  // Vrbo: "Reserved - <name>" or "Blocked".
  VRBO: { label: "Vrbo", classify: byKeywords },
  GOOGLE: { label: "Google Calendar", classify: () => "BLOCKED" },
  OTHER: { label: "iCal", classify: byKeywords },
};
