import { describe, expect, it } from "vitest";
import { buildIcs, parseIcs } from "@/server/calendar/ics";
import { CHANNELS } from "@/server/calendar/channels";
import { isPrivateAddress, normaliseCalendarUrl } from "@/server/calendar/safe-fetch";

// Shape of a real Airbnb export (all-day events, exclusive DTEND, folded lines, CRLF).
const AIRBNB_FEED = [
  "BEGIN:VCALENDAR",
  "PRODID;X-RICAL-TZSOURCE=TZINFO:-//Airbnb Inc//Hosting Calendar 1.0//EN",
  "CALSCALE:GREGORIAN",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "DTEND;VALUE=DATE:20270115",
  "DTSTART;VALUE=DATE:20270110",
  "UID:1418fb94e984-a1b2c3d4e5f6@airbnb.com",
  "DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMABCDEF\\nPhone Numbe",
  " r (Last 4 Digits): 1234",
  "SUMMARY:Reserved",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTEND;VALUE=DATE:20270203",
  "DTSTART;VALUE=DATE:20270201",
  "UID:7f3c2a1b9e8d-blocked@airbnb.com",
  "SUMMARY:Airbnb (Not available)",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20270301T180000Z",
  "DTEND:20270304T130000Z",
  "UID:utc-event@example.com",
  "SUMMARY:Reserved",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20270401",
  "UID:no-end@example.com",
  "SUMMARY:Blocked",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20270501",
  "DTEND;VALUE=DATE:20270505",
  "UID:cancelled@example.com",
  "STATUS:CANCELLED",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("parseIcs", () => {
  const events = parseIcs(AIRBNB_FEED, "America/Argentina/Cordoba");

  it("reads all-day events with exclusive end dates", () => {
    expect(events[0]).toEqual({
      externalId: "1418fb94e984-a1b2c3d4e5f6@airbnb.com",
      summary: "Reserved",
      start: "2027-01-10",
      end: "2027-01-15",
    });
  });

  it("converts UTC date-times to the property's calendar days", () => {
    // 18:00Z = 15:00 in Córdoba on Mar 1; 13:00Z = 10:00 on Mar 4.
    expect(events.find((e) => e.externalId === "utc-event@example.com")).toMatchObject({ start: "2027-03-01", end: "2027-03-04" });
  });

  it("defaults a missing DTEND to one night and skips cancelled events", () => {
    expect(events.find((e) => e.externalId === "no-end@example.com")).toMatchObject({ start: "2027-04-01", end: "2027-04-02" });
    expect(events.some((e) => e.externalId === "cancelled@example.com")).toBe(false);
  });

  it("classifies Airbnb bookings versus blocked nights", () => {
    expect(CHANNELS.AIRBNB.classify(events[0]!.summary)).toBe("BOOKING");
    expect(CHANNELS.AIRBNB.classify(events[1]!.summary)).toBe("BLOCKED");
  });

  it("round-trips our own export", () => {
    const ics = buildIcs("Casa del Lago", [
      { uid: "r1@destinocalamuchita", summary: "Reservado", start: "2027-06-10", end: "2027-06-14", kind: "BOOKING" },
    ]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20270610");
    expect(parseIcs(ics, "America/Argentina/Cordoba")).toEqual([
      { externalId: "r1@destinocalamuchita", summary: "Reservado", start: "2027-06-10", end: "2027-06-14" },
    ]);
  });
});

describe("calendar URL safety", () => {
  it("accepts https and webcal links, rejects everything else", () => {
    expect(normaliseCalendarUrl("webcal://www.airbnb.com/calendar/ical/1.ics?s=abc").protocol).toBe("https:");
    expect(() => normaliseCalendarUrl("http://example.com/a.ics")).toThrow("HTTPS_ONLY");
    expect(() => normaliseCalendarUrl("https://user:pass@example.com/a.ics")).toThrow("CREDENTIALS_IN_URL");
    expect(() => normaliseCalendarUrl("https://127.0.0.1/a.ics")).toThrow("PRIVATE_ADDRESS");
    expect(() => normaliseCalendarUrl("https://example.com:8443/a.ics")).toThrow("PORT_NOT_ALLOWED");
  });

  it("recognises private and loopback addresses", () => {
    for (const ip of ["10.1.2.3", "192.168.0.10", "172.20.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    for (const ip of ["8.8.8.8", "151.101.1.1", "2a03:2880:f003::1"]) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });
});
