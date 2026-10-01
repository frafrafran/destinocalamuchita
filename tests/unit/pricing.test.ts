import { describe, expect, it } from "vitest";
import { type PricingConfig, calculateQuote, minNightsFor } from "@/lib/pricing";

const base: PricingConfig = {
  property: {
    currency: "ARS",
    basePrice: 100_00,
    weekendPrice: 150_00,
    cleaningFee: 30_00,
    minNights: 2,
    maxNights: 30,
    maxGuests: 4,
  },
  seasons: [],
  rules: [],
};

const today = "2027-01-01";

describe("calculateQuote", () => {
  it("prices weekday and weekend nights (Fri/Sat nights are weekend)", () => {
    // 2027-01-06 is a Wednesday → nights Wed, Thu, Fri, Sat
    const result = calculateQuote({ checkIn: "2027-01-06", checkOut: "2027-01-10", guests: 2, today }, base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.nightly.map((n) => n.kind)).toEqual(["BASE", "BASE", "WEEKEND", "WEEKEND"]);
    expect(result.quote.nightlySubtotal).toBe(500_00);
    expect(result.quote.cleaningFee).toBe(30_00);
    expect(result.quote.total).toBe(530_00);
    expect(result.quote.nights).toBe(4);
  });

  it("applies seasons over base/weekend and special dates over seasons", () => {
    const config: PricingConfig = {
      ...base,
      seasons: [
        {
          id: "s1",
          name: "Verano",
          startDate: "2027-01-01",
          endDate: "2027-03-01",
          nightlyPrice: 200_00,
          weekendPrice: 260_00,
          minNights: 3,
        },
      ],
      rules: [{ id: "r1", type: "SPECIAL_DATE", name: "Feriado", startDate: "2027-01-07", endDate: "2027-01-08", amount: 400_00 }],
    };
    const result = calculateQuote({ checkIn: "2027-01-06", checkOut: "2027-01-10", guests: 2, today }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.nightly.map((n) => n.price)).toEqual([200_00, 400_00, 260_00, 260_00]);
    expect(result.quote.nightly[1]).toMatchObject({ kind: "SPECIAL", label: "Feriado" });
  });

  it("uses the stricter minimum stay between property and season", () => {
    const config: PricingConfig = {
      ...base,
      seasons: [
        { id: "s1", name: "Verano", startDate: "2027-01-01", endDate: "2027-02-01", nightlyPrice: 1, weekendPrice: null, minNights: 5 },
      ],
    };
    expect(minNightsFor("2027-01-10", config)).toBe(5);
    expect(minNightsFor("2027-02-10", config)).toBe(2);
    const result = calculateQuote({ checkIn: "2027-01-10", checkOut: "2027-01-13", guests: 1, today }, config);
    expect(result).toEqual({ ok: false, error: { code: "MIN_NIGHTS", minNights: 5 } });
  });

  it("picks the best eligible length-of-stay discount and applies it to nights only", () => {
    const config: PricingConfig = {
      ...base,
      property: { ...base.property, weekendPrice: null },
      rules: [
        { id: "d1", type: "LENGTH_DISCOUNT", name: "Semana", minNights: 7, percent: 10 },
        { id: "d2", type: "LENGTH_DISCOUNT", name: "Quincena", minNights: 14, percent: 20 },
      ],
    };
    const result = calculateQuote({ checkIn: "2027-01-04", checkOut: "2027-01-11", guests: 2, today }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.discount).toEqual({ name: "Semana", percent: 10, amount: 70_00 });
    expect(result.quote.total).toBe(700_00 - 70_00 + 30_00);
  });

  it("computes every fee unit", () => {
    const config: PricingConfig = {
      ...base,
      property: { ...base.property, weekendPrice: null, cleaningFee: 0 },
      rules: [
        { id: "f1", type: "FEE", name: "Ropa blanca", amount: 10_00, feeUnit: "PER_STAY" },
        { id: "f2", type: "FEE", name: "Calefacción", amount: 5_00, feeUnit: "PER_NIGHT" },
        { id: "f3", type: "FEE", name: "Tasa", amount: 2_00, feeUnit: "PER_GUEST" },
        { id: "f4", type: "FEE", name: "Tasa municipal", amount: 1_00, feeUnit: "PER_GUEST_NIGHT" },
      ],
    };
    const result = calculateQuote({ checkIn: "2027-01-04", checkOut: "2027-01-07", guests: 3, today }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.fees.map((f) => f.amount)).toEqual([10_00, 15_00, 6_00, 9_00]);
    expect(result.quote.feesTotal).toBe(40_00);
    expect(result.quote.total).toBe(300_00 + 40_00);
  });

  it("rejects invalid, past, too long and over-capacity requests", () => {
    expect(calculateQuote({ checkIn: "2027-01-05", checkOut: "2027-01-05", guests: 1, today }, base)).toEqual({
      ok: false,
      error: { code: "INVALID_DATES" },
    });
    expect(calculateQuote({ checkIn: "2027-02-30", checkOut: "2027-03-02", guests: 1, today }, base)).toEqual({
      ok: false,
      error: { code: "INVALID_DATES" },
    });
    expect(calculateQuote({ checkIn: "2026-12-30", checkOut: "2027-01-03", guests: 1, today }, base)).toEqual({
      ok: false,
      error: { code: "PAST_DATE" },
    });
    expect(calculateQuote({ checkIn: "2027-01-05", checkOut: "2027-02-20", guests: 1, today }, base)).toEqual({
      ok: false,
      error: { code: "MAX_NIGHTS", maxNights: 30 },
    });
    expect(calculateQuote({ checkIn: "2027-01-05", checkOut: "2027-01-08", guests: 5, today }, base)).toEqual({
      ok: false,
      error: { code: "MAX_GUESTS", maxGuests: 4 },
    });
    expect(calculateQuote({ checkIn: "2027-01-05", checkOut: "2027-01-08", guests: 0, today }, base)).toEqual({
      ok: false,
      error: { code: "INVALID_GUESTS" },
    });
  });
});
