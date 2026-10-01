import { describe, expect, it } from "vitest";
import { canCheckIn, canStay, findConflicts, latestCheckOut, occupiedNights } from "@/lib/availability";
import { addDays, addMonths, diffDays, eachNight, isValidISODate, rangesOverlap, todayISO } from "@/lib/dates";
import { centsToDecimalString, centsToInput, parseMoneyInput, toCents } from "@/lib/money";

describe("dates", () => {
  it("validates calendar days strictly", () => {
    expect(isValidISODate("2027-02-28")).toBe(true);
    expect(isValidISODate("2027-02-29")).toBe(false);
    expect(isValidISODate("2028-02-29")).toBe(true);
    expect(isValidISODate("2027-1-01")).toBe(false);
    expect(isValidISODate(20270101)).toBe(false);
  });

  it("does day arithmetic across month, year and DST boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
    expect(diffDays("2027-01-10", "2027-01-13")).toBe(3);
    expect(eachNight("2027-01-10", "2027-01-13")).toEqual(["2027-01-10", "2027-01-11", "2027-01-12"]);
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-01");
  });

  it("treats ranges as half-open", () => {
    expect(rangesOverlap("2027-01-10", "2027-01-13", "2027-01-13", "2027-01-15")).toBe(false);
    expect(rangesOverlap("2027-01-10", "2027-01-13", "2027-01-12", "2027-01-15")).toBe(true);
    expect(rangesOverlap("2027-01-10", "2027-01-20", "2027-01-12", "2027-01-14")).toBe(true);
  });

  it("computes today in the property timezone, not UTC", () => {
    // 02:00 UTC on Jan 10 is still Jan 9 in Córdoba (UTC-3).
    expect(todayISO("America/Argentina/Cordoba", new Date("2027-01-10T02:00:00Z"))).toBe("2027-01-09");
  });
});

describe("money", () => {
  it("converts decimals to integer cents without float errors", () => {
    expect(toCents("1234.56")).toBe(123456);
    expect(toCents("0.345")).toBe(35);
    expect(toCents("10")).toBe(1000);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(null)).toBe(0);
    expect(centsToDecimalString(123456)).toBe("1234.56");
    expect(centsToDecimalString(5)).toBe("0.05");
  });
});

describe("parseMoneyInput", () => {
  it("understands Argentine and international formats", () => {
    expect(parseMoneyInput("285.000")).toBe(28_500_000);
    expect(parseMoneyInput("285000")).toBe(28_500_000);
    expect(parseMoneyInput("285000.00")).toBe(28_500_000);
    expect(parseMoneyInput("285000,50")).toBe(28_500_050);
    expect(parseMoneyInput("1.336.200")).toBe(133_620_000);
    expect(parseMoneyInput("1.250,75")).toBe(125_075);
    expect(parseMoneyInput("1,250.75")).toBe(125_075);
    expect(parseMoneyInput("$ 90.000")).toBe(9_000_000);
    expect(parseMoneyInput("12.5")).toBe(1_250);
    expect(parseMoneyInput("0")).toBe(0);
  });

  it("rejects anything that is not an amount", () => {
    for (const value of ["", "abc", "-5", "1.2.3,4.5", "12,345,67", "1e5"]) {
      expect(() => parseMoneyInput(value)).toThrow();
    }
  });

  it("round-trips through the editable input format", () => {
    expect(centsToInput(28_500_000)).toBe("285000");
    expect(centsToInput(125_075)).toBe("1250.75");
    expect(parseMoneyInput(centsToInput(125_075))).toBe(125_075);
    expect(parseMoneyInput(centsToInput(28_500_000))).toBe(28_500_000);
  });
});

describe("availability", () => {
  const ranges = [
    { start: "2027-01-10", end: "2027-01-13", kind: "RESERVATION" as const },
    { start: "2027-01-20", end: "2027-01-22", kind: "EXTERNAL" as const },
  ];

  it("finds conflicts for overlapping stays only", () => {
    expect(findConflicts(ranges, "2027-01-13", "2027-01-20")).toHaveLength(0);
    expect(findConflicts(ranges, "2027-01-12", "2027-01-14")).toHaveLength(1);
    expect(findConflicts(ranges, "2027-01-01", "2027-01-31")).toHaveLength(2);
  });

  it("lets guests depart the morning another stay begins", () => {
    const occupied = occupiedNights(ranges, "2027-01-01", "2027-02-01");
    expect(canCheckIn(occupied, "2027-01-13")).toBe(true);
    expect(canCheckIn(occupied, "2027-01-12")).toBe(false);
    expect(latestCheckOut(occupied, "2027-01-15", 60)).toBe("2027-01-20");
    expect(canStay(occupied, "2027-01-15", "2027-01-20")).toBe(true);
    expect(canStay(occupied, "2027-01-15", "2027-01-21")).toBe(false);
  });
});
