import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, toDbDate, todayISO } from "@/lib/dates";
import { calculateQuote } from "@/lib/pricing";
import { ActionError } from "@/server/action-result";
import { loadPricingConfig } from "@/server/booking/pricing-config";
import { submitPaymentProof } from "@/server/booking/proofs";
import {
  cancelReservation,
  confirmReservation,
  createDirectReservation,
  expireAllStaleHolds,
  reviewProof,
} from "@/server/booking/reservations";
import { prisma } from "@/server/db";
import { createProperty, createStaffUser, guest, resetDatabase } from "./fixtures";

const GUEST_ACTOR = { type: "GUEST" as const, ip: "127.0.0.1" };
const start = addDays(todayISO(), 40);

async function quoteTotal(propertyId: string, checkIn: string, checkOut: string, guests = 2) {
  const config = await loadPricingConfig(prisma, propertyId);
  const result = calculateQuote({ checkIn, checkOut, guests, today: todayISO() }, config!);
  if (!result.ok) throw new Error(`quote failed: ${result.error.code}`);
  return result.quote.total;
}

function book(propertyId: string, checkIn: string, checkOut: string, expectedTotal: number, n = 1) {
  return createDirectReservation(
    { propertyId, checkIn, checkOut, guests: 2, guest: guest(n), comments: null, locale: "es", expectedTotal },
    GUEST_ACTOR,
  );
}

function errorCode(result: PromiseSettledResult<unknown>): string | null {
  if (result.status === "fulfilled") return null;
  return result.reason instanceof ActionError ? result.reason.code : String(result.reason);
}

beforeEach(resetDatabase);
afterAll(async () => prisma.$disconnect());

describe("double-booking prevention", () => {
  it("lets exactly one of many simultaneous requests for the same dates win", async () => {
    const property = await createProperty();
    const checkOut = addDays(start, 3);
    const total = await quoteTotal(property.id, start, checkOut);

    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => book(property.id, start, checkOut, total, i)));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").map(errorCode)).toEqual(Array(7).fill("DATES_UNAVAILABLE"));
    expect(await prisma.reservation.count({ where: { propertyId: property.id } })).toBe(1);
  });

  it("rejects partially overlapping concurrent stays but accepts back-to-back ones", async () => {
    const property = await createProperty();
    const a = { in: start, out: addDays(start, 3) };
    const b = { in: addDays(start, 2), out: addDays(start, 5) }; // overlaps a
    const c = { in: addDays(start, 3), out: addDays(start, 5) }; // starts the day a ends

    const [ra, rb] = await Promise.allSettled([
      book(property.id, a.in, a.out, await quoteTotal(property.id, a.in, a.out), 1),
      book(property.id, b.in, b.out, await quoteTotal(property.id, b.in, b.out), 2),
    ]);
    expect([ra, rb].filter((r) => r.status === "fulfilled")).toHaveLength(1);

    if (ra.status === "fulfilled") {
      await expect(book(property.id, c.in, c.out, await quoteTotal(property.id, c.in, c.out), 3)).resolves.toMatchObject({ code: expect.stringMatching(/^RMS-/) });
    }
  });

  it("enforces non-overlap in PostgreSQL itself (exclusion constraint)", async () => {
    const property = await createProperty();
    const first = await book(property.id, start, addDays(start, 3), await quoteTotal(property.id, start, addDays(start, 3)));
    const existing = await prisma.reservation.findUniqueOrThrow({ where: { id: first.id } });

    await expect(
      prisma.reservation.create({
        data: {
          code: "RMS-RAW001",
          propertyId: property.id,
          guestId: existing.guestId,
          status: "CONFIRMED",
          checkIn: toDbDate(addDays(start, 1)),
          checkOut: toDbDate(addDays(start, 4)),
          nights: 3,
          guestCount: 2,
          currency: "ARS",
          nightlySubtotal: "1",
          total: "1",
          priceBreakdown: {},
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses dates blocked manually or by an imported Airbnb event", async () => {
    const property = await createProperty();
    await prisma.availability.create({
      data: { propertyId: property.id, startDate: toDbDate(start), endDate: toDbDate(addDays(start, 2)), reason: "OWNER_USE" },
    });
    const integration = await prisma.calendarIntegration.create({
      data: {
        propertyId: property.id,
        channel: "AIRBNB",
        name: "Airbnb",
        importUrl: "https://www.airbnb.com/calendar/ical/1.ics",
        lastSyncedAt: new Date(), // fresh: the booking will not try to re-download it
      },
    });
    await prisma.calendarEvent.create({
      data: {
        integrationId: integration.id,
        propertyId: property.id,
        externalId: "airbnb-1",
        startDate: toDbDate(addDays(start, 10)),
        endDate: toDbDate(addDays(start, 13)),
      },
    });

    const blocked = await Promise.allSettled([
      book(property.id, addDays(start, 1), addDays(start, 3), await quoteTotal(property.id, addDays(start, 1), addDays(start, 3))),
      book(property.id, addDays(start, 11), addDays(start, 14), await quoteTotal(property.id, addDays(start, 11), addDays(start, 14))),
    ]);
    expect(blocked.map(errorCode)).toEqual(["DATES_UNAVAILABLE", "DATES_UNAVAILABLE"]);

    // The nights between both blocks remain bookable.
    await expect(
      book(property.id, addDays(start, 2), addDays(start, 10), await quoteTotal(property.id, addDays(start, 2), addDays(start, 10))),
    ).resolves.toBeTruthy();
  });

  it("releases dates when a payment hold expires", async () => {
    const property = await createProperty();
    const checkOut = addDays(start, 2);
    const total = await quoteTotal(property.id, start, checkOut);
    const first = await book(property.id, start, checkOut, total, 1);
    await prisma.reservation.update({ where: { id: first.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });

    const second = await book(property.id, start, checkOut, total, 2);
    expect(second.code).not.toBe(first.code);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("EXPIRED");
    expect(await expireAllStaleHolds()).toBe(0);
  });

  it("stops when the price changed since the guest saw it", async () => {
    const property = await createProperty();
    const checkOut = addDays(start, 2);
    const seen = await quoteTotal(property.id, start, checkOut);
    await prisma.property.update({ where: { id: property.id }, data: { basePrice: "150000" } });

    const result = await Promise.allSettled([book(property.id, start, checkOut, seen)]);
    expect(errorCode(result[0]!)).toBe("PRICE_CHANGED");
    const details = (result[0] as PromiseRejectedResult).reason.details;
    expect(details.quote.total).toBe(await quoteTotal(property.id, start, checkOut));
  });

  it("rejects stays in the past and below the minimum nights", async () => {
    const property = await createProperty({ minNights: 3 });
    const past = addDays(todayISO(), -5);
    const results = await Promise.allSettled([
      book(property.id, past, addDays(past, 3), 1),
      book(property.id, start, addDays(start, 2), 1),
    ]);
    expect(results.map((r) => (r.status === "rejected" ? (r.reason as ActionError).details?.code : null))).toEqual(["PAST_DATE", "MIN_NIGHTS"]);
  });
});

describe("payment proof workflow", () => {
  async function pngFile(name = "comprobante.png") {
    const buffer = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#ffffff" } }).png().toBuffer();
    return new File([new Uint8Array(buffer)], name, { type: "image/png" });
  }

  it("goes from awaiting payment to confirmed through upload, resubmission and approval", async () => {
    const staff = await createStaffUser();
    const actor = { type: "USER" as const, id: staff.id };
    const property = await createProperty();
    const checkOut = addDays(start, 3);
    const booking = await book(property.id, start, checkOut, await quoteTotal(property.id, start, checkOut));

    const first = await submitPaymentProof({ reservationId: booking.id, file: await pngFile(), declaredAmount: 100, ip: "127.0.0.1" });
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("PROOF_RECEIVED");

    await reviewProof(first.proofId, "REQUEST_NEW", actor, { note: "El comprobante está cortado", amountReceived: null });
    const afterRequest = await prisma.reservation.findUniqueOrThrow({ where: { id: booking.id } });
    expect(afterRequest.status).toBe("AWAITING_PAYMENT");
    expect(afterRequest.holdExpiresAt).not.toBeNull();

    const second = await submitPaymentProof({ reservationId: booking.id, file: await pngFile("otro.png"), declaredAmount: null, ip: "127.0.0.1" });
    await reviewProof(second.proofId, "APPROVE", actor, { note: null, amountReceived: null });

    const confirmed = await prisma.reservation.findUniqueOrThrow({ where: { id: booking.id }, include: { payments: { include: { proofs: true } } } });
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.payments[0]!.status).toBe("VERIFIED");
    expect(confirmed.payments[0]!.proofs.map((p) => p.status).sort()).toEqual(["APPROVED", "RESUBMISSION_REQUESTED"]);

    // Guest emails were queued for every step (outbox).
    const templates = (await prisma.notification.findMany({ where: { reservationId: booking.id, channel: "EMAIL", recipient: guest().email } })).map((n) => n.template);
    expect(templates).toEqual(
      expect.arrayContaining(["RESERVATION_REQUESTED", "PROOF_RECEIVED", "PROOF_REJECTED", "RESERVATION_CONFIRMED"]),
    );
  });

  it("rejects files that are not JPG, PNG or PDF regardless of their name", async () => {
    const property = await createProperty();
    const checkOut = addDays(start, 2);
    const booking = await book(property.id, start, checkOut, await quoteTotal(property.id, start, checkOut));
    const fake = new File([new TextEncoder().encode("<script>alert(1)</script>")], "comprobante.png", { type: "image/png" });
    await expect(submitPaymentProof({ reservationId: booking.id, file: fake, declaredAmount: null, ip: "x" })).rejects.toMatchObject({ code: "FILE_TYPE" });
    const pdfWithJs = new File([new TextEncoder().encode("%PDF-1.4\n1 0 obj << /OpenAction << /S /J#61vaScript /JS (app.alert(1)) >> >>")], "c.pdf");
    await expect(submitPaymentProof({ reservationId: booking.id, file: pdfWithJs, declaredAmount: null, ip: "x" })).rejects.toMatchObject({ code: "FILE_UNSAFE" });
  });

  it("will not confirm a pending stay that now collides with an Airbnb booking", async () => {
    const staff = await createStaffUser();
    const property = await createProperty();
    const checkOut = addDays(start, 3);
    const booking = await book(property.id, start, checkOut, await quoteTotal(property.id, start, checkOut));
    const integration = await prisma.calendarIntegration.create({
      data: { propertyId: property.id, channel: "AIRBNB", name: "Airbnb", importUrl: "https://example.com/a.ics", lastSyncedAt: new Date() },
    });
    await prisma.calendarEvent.create({
      data: { integrationId: integration.id, propertyId: property.id, externalId: "x", startDate: toDbDate(addDays(start, 1)), endDate: toDbDate(addDays(start, 2)) },
    });

    await expect(confirmReservation(booking.id, { type: "USER", id: staff.id }, { amountReceived: null })).rejects.toMatchObject({ code: "CALENDAR_CONFLICT" });
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: booking.id } })).hasConflict).toBe(true);

    await cancelReservation(booking.id, { type: "USER", id: staff.id }, "Reservada en Airbnb", true);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CANCELLED");
  });
});
