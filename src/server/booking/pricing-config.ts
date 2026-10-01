import "server-only";
import type { PriceRule, Property, Season } from "@/generated/prisma/client";
import { fromDbDate } from "@/lib/dates";
import { toCents } from "@/lib/money";
import type { PricingConfig, PricingRule } from "@/lib/pricing";
import type { Db } from "../db";

type PricingProperty = Pick<
  Property,
  "id" | "currency" | "basePrice" | "weekendPrice" | "cleaningFee" | "minNights" | "maxNights" | "maxGuests"
>;

export function toPricingConfig(property: PricingProperty, seasons: Season[], rules: PriceRule[]): PricingConfig {
  return {
    property: {
      currency: property.currency,
      basePrice: toCents(property.basePrice),
      weekendPrice: property.weekendPrice === null ? null : toCents(property.weekendPrice),
      cleaningFee: toCents(property.cleaningFee),
      minNights: property.minNights,
      maxNights: property.maxNights,
      maxGuests: property.maxGuests,
    },
    seasons: seasons.map((season) => ({
      id: season.id,
      name: season.name,
      startDate: fromDbDate(season.startDate),
      endDate: fromDbDate(season.endDate),
      nightlyPrice: toCents(season.nightlyPrice),
      weekendPrice: season.weekendPrice === null ? null : toCents(season.weekendPrice),
      minNights: season.minNights,
    })),
    rules: rules.filter((rule) => rule.isActive).flatMap((rule): PricingRule[] => {
      if (rule.type === "SPECIAL_DATE" && rule.startDate && rule.endDate && rule.amount !== null) {
        return [
          {
            id: rule.id,
            type: "SPECIAL_DATE",
            name: rule.name,
            startDate: fromDbDate(rule.startDate),
            endDate: fromDbDate(rule.endDate),
            amount: toCents(rule.amount),
          },
        ];
      }
      if (rule.type === "LENGTH_DISCOUNT" && rule.minNights !== null && rule.percent !== null) {
        return [{ id: rule.id, type: "LENGTH_DISCOUNT", name: rule.name, minNights: rule.minNights, percent: Number(rule.percent) }];
      }
      if (rule.type === "FEE" && rule.amount !== null && rule.feeUnit) {
        return [{ id: rule.id, type: "FEE", name: rule.name, amount: toCents(rule.amount), feeUnit: rule.feeUnit }];
      }
      return [];
    }),
  };
}

export async function loadPricingConfig(db: Db, propertyId: string): Promise<PricingConfig | null> {
  const property = await db.property.findUnique({
    where: { id: propertyId },
    include: { seasons: { orderBy: { startDate: "asc" } }, priceRules: true },
  });
  if (!property) return null;
  return toPricingConfig(property, property.seasons, property.priceRules);
}
