import ICAL from "ical.js";
import type { CalendarEventKind } from "@/generated/prisma/enums";
import { type ISODate, addDays, todayISO } from "@/lib/dates";

/**
 * iCalendar (RFC 5545) parsing and generation. Pure functions: no I/O, fully unit-tested.
 * Channel feeds (Airbnb, Booking, Vrbo…) publish one VEVENT per occupied range with all-day
 * DTSTART/DTEND, DTEND exclusive — the same half-open convention used everywhere in this app.
 */

export interface ParsedEvent {
  externalId: string;
  summary: string;
  start: ISODate;
  end: ISODate;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function timeToDate(time: InstanceType<typeof ICAL.Time>, timeZone: string): ISODate {
  const zone = time.zone?.tzid;
  if (!time.isDate && zone === "UTC") return todayISO(timeZone, time.toJSDate());
  // DATE values, floating times and zoned wall-clock times: the calendar day as written.
  return `${time.year}-${pad(time.month)}-${pad(time.day)}`;
}

export function parseIcs(text: string, timeZone: string): ParsedEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  const events: ParsedEvent[] = [];
  const seen = new Set<string>();

  for (const component of root.getAllSubcomponents("vevent")) {
    const status = String(component.getFirstPropertyValue("status") ?? "").toUpperCase();
    if (status === "CANCELLED") continue;

    const event = new ICAL.Event(component);
    if (!event.startDate) continue;

    const start = timeToDate(event.startDate, timeZone);
    let end = event.endDate ? timeToDate(event.endDate, timeZone) : addDays(start, 1);
    if (end <= start) end = addDays(start, 1);

    const recurrence = component.getFirstPropertyValue("recurrence-id");
    const uid = event.uid || `${start}/${end}/${event.summary ?? ""}`;
    const externalId = recurrence ? `${uid}#${recurrence.toString()}` : uid;
    if (seen.has(externalId)) continue;
    seen.add(externalId);

    events.push({ externalId: externalId.slice(0, 500), summary: (event.summary ?? "").slice(0, 300), start, end });
  }
  return events;
}

// ─── Export ────────────────────────────────────────────────────────────────────

export interface ExportEvent {
  uid: string;
  summary: string;
  start: ISODate;
  end: ISODate;
  kind: CalendarEventKind;
}

function icsDate(value: ISODate): string {
  return value.replaceAll("-", "");
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds lines longer than 75 octets as RFC 5545 requires. */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 73) parts.push((i === 0 ? "" : " ") + line.slice(i, i + 73));
  return parts.join("\r\n");
}

export function buildIcs(calendarName: string, events: ExportEvent[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DestinoCalamuchita//Reservas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(event.start)}`,
      `DTEND;VALUE=DATE:${icsDate(event.end)}`,
      `SUMMARY:${escapeText(event.summary)}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
