"use server";

import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { BlockedRange } from "@/lib/availability";
import { addDays, isValidISODate, todayISO, toDbDate } from "@/lib/dates";
import type { PricingConfig } from "@/lib/pricing";
import { type ActionResult, ActionError, parseInput, runAction } from "@/server/action-result";
import { audit } from "@/server/audit";
import { propertyScope, requireActionUser } from "@/server/auth/guard";
import { loadPropertyRanges, toPublicRanges } from "@/server/booking/availability";
import { lockProperty } from "@/server/booking/locks";
import { loadPricingConfig } from "@/server/booking/pricing-config";
import { prisma } from "@/server/db";
import { getClientIp } from "@/server/request";

/** Calendar data for the staff booking form (past dates allowed for record-keeping). */
export async function getPropertyBookingDataAction(propertyId: string): Promise<ActionResult<{ blocked: BlockedRange[]; pricing: PricingConfig }>> {
  return runAction(async () => {
    const user = await requireActionUser("reservations:write");
    const property = await prisma.property.findFirst({ where: { id: propertyId, ...propertyScope(user) }, select: { id: true } });
    if (!property) throw new ActionError("NOT_FOUND");
    const today = todayISO();
    const [ranges, pricing] = await Promise.all([
      loadPropertyRanges(prisma, property.id, addDays(today, -60), addDays(today, 540)),
      loadPricingConfig(prisma, property.id),
    ]);
    return { blocked: toPublicRanges(ranges), pricing: pricing! };
  });
}

const blockSchema = z
  .object({
    propertyId: z.string().min(1),
    startDate: z.string().refine(isValidISODate),
    /** Inclusive last blocked day, as staff think about it ("from the 15th to the 20th"). */
    lastDate: z.string().refine(isValidISODate),
    reason: z.enum(["OWNER_USE", "MAINTENANCE", "MANUAL", "OTHER"]),
    note: z.string().trim().max(300).optional(),
  })
  .refine((value) => value.lastDate >= value.startDate, { path: ["lastDate"], message: "dateOrder" })
  // Blocking past nights changes nothing and would only clutter the calendar.
  .refine((value) => value.startDate >= todayISO(), { path: ["startDate"], message: "pastDate" });

/**
 * Blocks dates for a property. Runs under the property lock and refuses to cover nights already
 * held by a reservation (those must be cancelled or moved first).
 */
export async function createBlockAction(input: z.input<typeof blockSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireActionUser("calendar:write");
    const t = await getTranslations("validation");
    const data = parseInput(blockSchema, input, t);
    const endDate = addDays(data.lastDate, 1);
    const ip = await getClientIp();

    const block = await prisma.$transaction(async (tx) => {
      await lockProperty(tx, data.propertyId);
      const ranges = await loadPropertyRanges(tx, data.propertyId, data.startDate, endDate);
      const reservations = ranges.filter((range) => range.kind === "RESERVATION");
      if (reservations.length) {
        throw new ActionError("DATES_UNAVAILABLE", { reservations: reservations.map((r) => (r.kind === "RESERVATION" ? r.code : "")) });
      }
      const created = await tx.availability.create({
        data: {
          propertyId: data.propertyId,
          startDate: toDbDate(data.startDate),
          endDate: toDbDate(endDate),
          reason: data.reason,
          note: data.note || null,
          createdById: user.id,
        },
      });
      await audit(tx, { type: "USER", id: user.id, ip }, "availability.blocked", { type: "Availability", id: created.id }, {
        propertyId: data.propertyId,
        startDate: data.startDate,
        lastDate: data.lastDate,
        reason: data.reason,
      });
      return created;
    });
    refresh();
    return { id: block.id };
  });
}

export async function deleteBlockAction(blockId: string): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireActionUser("calendar:write");
    const block = await prisma.availability.delete({ where: { id: blockId } }).catch(() => null);
    if (!block) throw new ActionError("NOT_FOUND");
    await audit(prisma, { type: "USER", id: user.id, ip: await getClientIp() }, "availability.unblocked", { type: "Availability", id: blockId }, {
      propertyId: block.propertyId,
    });
    refresh();
    return undefined;
  });
}
