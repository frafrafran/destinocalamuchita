import { z } from "zod";
import { isValidISODate } from "./dates";

/** Catalog filters as they travel in the URL. Invalid values are dropped, never fatal. */
const int = (min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).optional().catch(undefined);

const date = z
  .string()
  .optional()
  .transform((value) => (value && isValidISODate(value) ? value : undefined))
  .catch(undefined);

export const SORT_KEYS = ["recommended", "price_asc", "price_desc", "newest", "rating"] as const;
export const PROPERTY_TYPES = ["HOUSE", "APARTMENT", "CABIN", "VILLA", "LOFT"] as const;

export const catalogParamsSchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  city: z.string().trim().max(80).optional().catch(undefined),
  type: z.enum(PROPERTY_TYPES).optional().catch(undefined),
  guests: int(1, 30),
  bedrooms: int(1, 20),
  priceMin: int(0, 100_000_000),
  priceMax: int(0, 100_000_000),
  amenities: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",").filter((key) => /^[a-z0-9_]{1,40}$/.test(key)).slice(0, 20) : undefined))
    .catch(undefined),
  checkIn: date,
  checkOut: date,
  sort: z.enum(SORT_KEYS).optional().catch(undefined),
});

export type CatalogParams = z.output<typeof catalogParamsSchema>;

export function parseCatalogParams(raw: Record<string, string | string[] | undefined>): CatalogParams {
  const flat = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const parsed = catalogParamsSchema.parse(flat);
  if (parsed.checkIn && parsed.checkOut && parsed.checkOut <= parsed.checkIn) {
    parsed.checkIn = undefined;
    parsed.checkOut = undefined;
  }
  if (!parsed.checkIn || !parsed.checkOut) {
    parsed.checkIn = undefined;
    parsed.checkOut = undefined;
  }
  return parsed;
}

/** Query string carrying the stay (dates and guests) into property pages. */
export function stayQuery(params: Pick<CatalogParams, "checkIn" | "checkOut" | "guests">): string {
  const query = new URLSearchParams();
  if (params.checkIn && params.checkOut) {
    query.set("checkIn", params.checkIn);
    query.set("checkOut", params.checkOut);
  }
  if (params.guests) query.set("guests", String(params.guests));
  return query.toString();
}
