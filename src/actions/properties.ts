"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { LOCALES } from "@/i18n/config";
import { addDays, isValidISODate, toDbDate } from "@/lib/dates";
import { centsToDecimalString, parseMoneyInput } from "@/lib/money";
import { slugify } from "@/lib/utils";
import { toEmbedUrl } from "@/lib/video";
import { type ActionResult, ActionError, parseInput, runAction } from "@/server/action-result";
import { audit } from "@/server/audit";
import { requireActionUser } from "@/server/auth/guard";
import { lockProperty } from "@/server/booking/locks";
import { syncIntegration } from "@/server/calendar/sync";
import { UnsafeUrlError, normaliseCalendarUrl } from "@/server/calendar/safe-fetch";
import { prisma } from "@/server/db";
import { getClientIp } from "@/server/request";
import { getPublishChecklist } from "@/server/queries/properties";
import { storage } from "@/server/storage";

async function context(permission: "properties:write" | "properties:delete" | "integrations:manage" = "properties:write") {
  const user = await requireActionUser(permission);
  const t = await getTranslations("validation");
  return { user, t, actor: { type: "USER" as const, id: user.id, ip: await getClientIp() } };
}

/** Money typed by staff ("285.000", "285000,50", "285000") → decimal string for Prisma. */
const money = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .transform((value, ctx) => {
    try {
      return centsToDecimalString(parseMoneyInput(value));
    } catch {
      ctx.addIssue({ code: "custom", message: "invalid" });
      return z.NEVER;
    }
  });
const optionalMoney = z
  .string()
  .trim()
  .max(20)
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    try {
      return centsToDecimalString(parseMoneyInput(value));
    } catch {
      ctx.addIssue({ code: "custom", message: "invalid" });
      return z.NEVER;
    }
  });
const isoDate = z.string().refine(isValidISODate);
const text = (max: number) => z.string().trim().max(max);

// ─── Information ──────────────────────────────────────────────────────────────

const infoSchema = z.object({
  title: text(120).min(2),
  slug: text(90).optional(),
  type: z.enum(["HOUSE", "APARTMENT", "CABIN", "VILLA", "LOFT"]),
  summary: text(240),
  description: text(8000),
  city: text(80).min(2),
  region: text(80).min(2),
  address: text(200),
  postalCode: text(20).optional(),
  latitude: z.union([z.literal(""), z.coerce.number().min(-90).max(90)]).optional(),
  longitude: z.union([z.literal(""), z.coerce.number().min(-180).max(180)]).optional(),
  maxGuests: z.coerce.number().int().min(1).max(50),
  bedrooms: z.coerce.number().int().min(0).max(50),
  beds: z.coerce.number().int().min(0).max(80),
  bathrooms: z.coerce.number().min(0).max(30),
  areaM2: z.union([z.literal(""), z.coerce.number().int().min(1).max(100_000)]).optional(),
  ownerId: z.string().optional(),
  videoUrl: z
    .string()
    .trim()
    .max(300)
    .optional()
    .refine((value) => !value || toEmbedUrl(value) !== null, { message: "url" }),
  featured: z.boolean().optional(),
  // Published rating copied from Airbnb or another platform; shown only when both values are set.
  ratingAverage: z
    .union([z.literal(""), z.preprocess((value) => (typeof value === "string" ? value.trim().replace(",", ".") : value), z.coerce.number().min(1).max(5))])
    .optional(),
  ratingCount: z.union([z.literal(""), z.coerce.number().int().min(0).max(100_000)]).optional(),
}).refine((value) => value.ratingAverage === "" || value.ratingAverage === undefined || Number(value.ratingCount) > 0, {
  path: ["ratingCount"],
  message: "required",
});

export type PropertyInfoInput = z.input<typeof infoSchema>;

function infoData(data: z.output<typeof infoSchema>) {
  return {
    title: data.title,
    type: data.type,
    summary: data.summary,
    description: data.description,
    city: data.city,
    region: data.region,
    address: data.address,
    postalCode: data.postalCode || null,
    latitude: data.latitude === "" || data.latitude === undefined ? null : data.latitude.toFixed(6),
    longitude: data.longitude === "" || data.longitude === undefined ? null : data.longitude.toFixed(6),
    maxGuests: data.maxGuests,
    bedrooms: data.bedrooms,
    beds: data.beds,
    bathrooms: data.bathrooms.toFixed(1),
    areaM2: data.areaM2 === "" || data.areaM2 === undefined ? null : data.areaM2,
    ownerId: data.ownerId || null,
    videoUrl: data.videoUrl || null,
    featured: data.featured ?? false,
    ratingAverage: data.ratingAverage === "" || data.ratingAverage === undefined ? null : data.ratingAverage.toFixed(2),
    ratingCount: data.ratingAverage === "" || data.ratingAverage === undefined ? 0 : Number(data.ratingCount),
  };
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || "propiedad";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const taken = await prisma.property.findFirst({ where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${root}-${randomBytes(3).toString("hex")}`;
}

export async function createPropertyAction(input: PropertyInfoInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { t, actor } = await context();
    const data = parseInput(infoSchema, input, t);
    const property = await prisma.property.create({
      data: {
        ...infoData(data),
        slug: await uniqueSlug(data.slug || data.title),
        status: "DRAFT",
        basePrice: "0",
        icalExportToken: randomBytes(24).toString("base64url"),
      },
    });
    await audit(prisma, actor, "property.created", { type: "Property", id: property.id }, { title: property.title });
    return { id: property.id };
  });
}

export async function updatePropertyInfoAction(id: string, input: PropertyInfoInput): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { t, actor } = await context();
    const data = parseInput(infoSchema, input, t);
    await prisma.property.update({
      where: { id },
      data: { ...infoData(data), ...(data.slug ? { slug: await uniqueSlug(data.slug, id) } : {}) },
    });
    await audit(prisma, actor, "property.updated", { type: "Property", id }, { section: "info" });
    refresh();
    return undefined;
  });
}

const translationSchema = z.object({
  locale: z.enum(LOCALES),
  title: text(120).optional(),
  summary: text(240).optional(),
  description: text(8000).optional(),
  houseRules: text(4000).optional(),
  arrivalInstructions: text(4000).optional(),
  cancellationPolicy: text(4000).optional(),
});

/** Saves the non-default-language copy; empty fields fall back to Spanish on the site. */
export async function saveTranslationAction(propertyId: string, input: z.input<typeof translationSchema>): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { t, actor } = await context();
    const data = parseInput(translationSchema, input, t);
    const fields = Object.fromEntries(
      (["title", "summary", "description", "houseRules", "arrivalInstructions", "cancellationPolicy"] as const)
        .filter((key) => data[key] !== undefined)
        .map((key) => [key, data[key] || null]),
    );
    await prisma.propertyTranslation.upsert({
      where: { propertyId_locale: { propertyId, locale: data.locale } },
      create: { propertyId, locale: data.locale, ...fields },
      update: fields,
    });
    await audit(prisma, actor, "property.updated", { type: "Property", id: propertyId }, { section: "translation", locale: data.locale });
    refresh();
    return undefined;
  });
}

// ─── Photos ───────────────────────────────────────────────────────────────────

const imagesSchema = z.array(z.object({ id: z.string(), alt: text(200) })).max(80);

/** Persists the new order (array order) and alt texts. */
export async function saveImagesAction(propertyId: string, input: z.input<typeof imagesSchema>): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { t, actor } = await context();
    const images = parseInput(imagesSchema, input, t);
    await prisma.$transaction(
      images.map((image, position) => prisma.propertyImage.update({ where: { id: image.id, propertyId }, data: { position, alt: image.alt } })),
    );
    await audit(prisma, actor, "property.updated", { type: "Property", id: propertyId }, { section: "photos" });
    refresh();
    return undefined;
  });
}

export async function deleteImageAction(imageId: string): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { actor } = await context();
    const image = await prisma.propertyImage.delete({ where: { id: imageId } }).catch(() => null);
    if (!image) throw new ActionError("NOT_FOUND");
    if (image.storageKey) await storage().delete("public", image.storageKey).catch(() => undefined);
    await audit(prisma, actor, "property.image_deleted", { type: "Property", id: image.propertyId });
    refresh();
    return undefined;
  });
}

// ─── Amenities ────────────────────────────────────────────────────────────────

export async function setAmenitiesAction(propertyId: string, amenityIds: string[]): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { actor } = await context();
    const ids = [...new Set(amenityIds)].slice(0, 100);
    await prisma.$transaction([
      prisma.propertyAmenity.deleteMany({ where: { propertyId } }),
      prisma.propertyAmenity.createMany({ data: ids.map((amenityId) => ({ propertyId, amenityId })) }),
    ]);
    await audit(prisma, actor, "property.updated", { type: "Property", id: propertyId }, { section: "amenities", count: ids.length });
    refresh();
    return undefined;
  });
}

const amenitySchema = z.object({ label: text(60).min(2), icon: text(40).min(2), category: z.enum(["essentials", "kitchen", "comfort", "outdoor", "services", "family", "safety", "general"]) });

export async function createAmenityAction(input: z.input<typeof amenitySchema>): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { t, actor } = await context();
    const data = parseInput(amenitySchema, input, t);
    const key = `custom_${slugify(data.label).replace(/-/g, "_")}`.slice(0, 40);
    const existing = await prisma.amenity.findUnique({ where: { key } });
    if (existing) throw new ActionError("DUPLICATE");
    const amenity = await prisma.amenity.create({ data: { key, ...data } });
    await audit(prisma, actor, "amenity.created", { type: "Amenity", id: amenity.id }, { label: data.label });
    refresh();
    return { id: amenity.id };
  });
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

const pricingSchema = z
  .object({
    currency: z.enum(["ARS", "USD"]),
    basePrice: money,
    weekendPrice: optionalMoney,
    cleaningFee: optionalMoney,
    minNights: z.coerce.number().int().min(1).max(365),
    maxNights: z.union([z.literal(""), z.coerce.number().int().min(1).max(365)]).optional(),
  })
  .refine((value) => value.maxNights === "" || value.maxNights === undefined || value.maxNights >= value.minNights, { path: ["maxNights"], message: "invalid" });

export async function savePricingAction(propertyId: string, input: z.input<typeof pricingSchema>): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { t, actor } = await context();
    const data = parseInput(pricingSchema, input, t);
    await prisma.property.update({
      where: { id: propertyId },
      data: {
        currency: data.currency,
        basePrice: data.basePrice,
        weekendPrice: data.weekendPrice,
        cleaningFee: data.cleaningFee ?? "0",
        minNights: data.minNights,
        maxNights: data.maxNights === "" || data.maxNights === undefined ? null : data.maxNights,
      },
    });
    await audit(prisma, actor, "property.updated", { type: "Property", id: propertyId }, { section: "pricing" });
    refresh();
    return undefined;
  });
}

const seasonSchema = z
  .object({
    id: z.string().optional(),
    name: text(80).min(2),
    startDate: isoDate,
    /** Inclusive last night of the season, as staff think about it. */
    lastDate: isoDate,
    nightlyPrice: money,
    weekendPrice: optionalMoney,
    minNights: z.union([z.literal(""), z.coerce.number().int().min(1).max(365)]).optional(),
  })
  .refine((value) => value.lastDate >= value.startDate, { path: ["lastDate"], message: "dateOrder" });

export async function saveSeasonAction(propertyId: string, input: z.input<typeof seasonSchema>): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { t, actor } = await context();
    const data = parseInput(seasonSchema, input, t);
    const values = {
      name: data.name,
      startDate: toDbDate(data.startDate),
      endDate: toDbDate(addDays(data.lastDate, 1)),
      nightlyPrice: data.nightlyPrice,
      weekendPrice: data.weekendPrice,
      minNights: data.minNights === "" || data.minNights === undefined ? null : data.minNights,
    };
    if (data.id) await prisma.season.update({ where: { id: data.id, propertyId }, data: values });
    else await prisma.season.create({ data: { ...values, propertyId } });
    await audit(prisma, actor, "property.updated", { type: "Property", id: propertyId }, { section: "season", name: data.name });
    refresh();
    return undefined;
  });
}

export async function deleteSeasonAction(seasonId: string): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { actor } = await context();
    const season = await prisma.season.delete({ where: { id: seasonId } }).catch(() => null);
    if (!season) throw new ActionError("NOT_FOUND");
    await audit(prisma, actor, "property.updated", { type: "Property", id: season.propertyId }, { section: "season_deleted", name: season.name });
    refresh();
    return undefined;
  });
}

const ruleSchema = z.discriminatedUnion("type", [
  z
    .object({ id: z.string().optional(), type: z.literal("SPECIAL_DATE"), name: text(80).min(2), startDate: isoDate, lastDate: isoDate, amount: money })
    .refine((value) => value.lastDate >= value.startDate, { path: ["lastDate"], message: "dateOrder" }),
  z.object({ id: z.string().optional(), type: z.literal("LENGTH_DISCOUNT"), name: text(80).min(2), minNights: z.coerce.number().int().min(2).max(365), percent: z.coerce.number().min(1).max(90) }),
  z.object({ id: z.string().optional(), type: z.literal("FEE"), name: text(80).min(2), amount: money, feeUnit: z.enum(["PER_STAY", "PER_NIGHT", "PER_GUEST", "PER_GUEST_NIGHT"]) }),
]);

export async function saveRuleAction(propertyId: string, input: z.input<typeof ruleSchema>): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { t, actor } = await context();
    const data = parseInput(ruleSchema, input, t);
    const values: Omit<Prisma.PriceRuleUncheckedCreateInput, "propertyId"> =
      data.type === "SPECIAL_DATE"
        ? { type: data.type, name: data.name, startDate: toDbDate(data.startDate), endDate: toDbDate(addDays(data.lastDate, 1)), amount: data.amount, percent: null, minNights: null, feeUnit: null }
        : data.type === "LENGTH_DISCOUNT"
          ? { type: data.type, name: data.name, minNights: data.minNights, percent: String(data.percent), amount: null, startDate: null, endDate: null, feeUnit: null }
          : { type: data.type, name: data.name, amount: data.amount, feeUnit: data.feeUnit, percent: null, minNights: null, startDate: null, endDate: null };
    if (data.id) await prisma.priceRule.update({ where: { id: data.id, propertyId }, data: values });
    else await prisma.priceRule.create({ data: { ...values, propertyId } });
    await audit(prisma, actor, "property.updated", { type: "Property", id: propertyId }, { section: "price_rule", name: data.name });
    refresh();
    return undefined;
  });
}

export async function deleteRuleAction(ruleId: string): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { actor } = await context();
    const rule = await prisma.priceRule.delete({ where: { id: ruleId } }).catch(() => null);
    if (!rule) throw new ActionError("NOT_FOUND");
    await audit(prisma, actor, "property.updated", { type: "Property", id: rule.propertyId }, { section: "price_rule_deleted", name: rule.name });
    refresh();
    return undefined;
  });
}

// ─── Stay rules ───────────────────────────────────────────────────────────────

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const stayRulesSchema = z.object({
  checkInTime: time,
  checkOutTime: time,
  houseRules: text(4000),
  arrivalInstructions: text(4000),
  cancellationPolicy: text(4000),
});

export async function saveStayRulesAction(propertyId: string, input: z.input<typeof stayRulesSchema>): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { t, actor } = await context();
    const data = parseInput(stayRulesSchema, input, t);
    await prisma.property.update({ where: { id: propertyId }, data });
    await audit(prisma, actor, "property.updated", { type: "Property", id: propertyId }, { section: "rules" });
    refresh();
    return undefined;
  });
}

// ─── Channels (iCal) ──────────────────────────────────────────────────────────

const integrationSchema = z.object({
  channel: z.enum(["AIRBNB", "BOOKING", "VRBO", "GOOGLE", "OTHER"]),
  name: text(80).min(2),
  importUrl: z.string().trim().min(10).max(1000),
});

export async function addIntegrationAction(propertyId: string, input: z.input<typeof integrationSchema>): Promise<ActionResult<{ synced: boolean; error?: string }>> {
  return runAction(async () => {
    const { t, actor } = await context("integrations:manage");
    const data = parseInput(integrationSchema, input, t);
    let url: URL;
    try {
      url = normaliseCalendarUrl(data.importUrl);
    } catch (error) {
      if (error instanceof UnsafeUrlError) throw new ActionError("ICAL_URL", undefined, { importUrl: t("url") });
      throw error;
    }
    const exists = await prisma.calendarIntegration.findFirst({ where: { propertyId, importUrl: url.toString() } });
    if (exists) throw new ActionError("DUPLICATE");
    const integration = await prisma.calendarIntegration.create({ data: { propertyId, channel: data.channel, name: data.name, importUrl: url.toString() } });
    await audit(prisma, actor, "integration.created", { type: "CalendarIntegration", id: integration.id }, { channel: data.channel, propertyId });
    const outcome = await syncIntegration(integration.id);
    refresh();
    return outcome.ok ? { synced: true } : { synced: false, error: outcome.error };
  });
}

export async function syncIntegrationAction(integrationId: string): Promise<ActionResult<{ events: number; newConflicts: number }>> {
  return runAction(async () => {
    const { actor } = await context("integrations:manage");
    const outcome = await syncIntegration(integrationId);
    await audit(prisma, actor, "integration.synced", { type: "CalendarIntegration", id: integrationId }, { ok: outcome.ok });
    refresh();
    if (!outcome.ok) throw new ActionError("ICAL_URL", { reason: outcome.error });
    return { events: outcome.events, newConflicts: outcome.newConflicts };
  });
}

/** "Sync everything now" from the channels overview (ignores the usual 30-minute spacing). */
export async function syncAllIntegrationsAction(): Promise<ActionResult<{ synced: number; failed: number }>> {
  return runAction(async () => {
    const { actor } = await context("integrations:manage");
    const integrations = await prisma.calendarIntegration.findMany({ where: { isActive: true }, select: { id: true } });
    let synced = 0;
    let failed = 0;
    for (const { id } of integrations) {
      const outcome = await syncIntegration(id);
      if (outcome.ok) synced++;
      else failed++;
    }
    await audit(prisma, actor, "integration.synced_all", { type: "CalendarIntegration" }, { synced, failed });
    refresh();
    return { synced, failed };
  });
}

export async function toggleIntegrationAction(integrationId: string, isActive: boolean): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { actor } = await context("integrations:manage");
    const integration = await prisma.calendarIntegration.findUnique({ where: { id: integrationId } });
    if (!integration) throw new ActionError("NOT_FOUND");
    // Pausing a feed frees its dates in our calendar: take the property lock like any availability change.
    await prisma.$transaction(async (tx) => {
      await lockProperty(tx, integration.propertyId);
      await tx.calendarIntegration.update({ where: { id: integrationId }, data: { isActive } });
    });
    await audit(prisma, actor, isActive ? "integration.resumed" : "integration.paused", { type: "CalendarIntegration", id: integrationId });
    refresh();
    return undefined;
  });
}

export async function deleteIntegrationAction(integrationId: string): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { actor } = await context("integrations:manage");
    const integration = await prisma.calendarIntegration.findUnique({ where: { id: integrationId } });
    if (!integration) throw new ActionError("NOT_FOUND");
    await prisma.$transaction(async (tx) => {
      await lockProperty(tx, integration.propertyId);
      await tx.calendarIntegration.delete({ where: { id: integrationId } });
    });
    await audit(prisma, actor, "integration.deleted", { type: "CalendarIntegration", id: integrationId }, { channel: integration.channel });
    refresh();
    return undefined;
  });
}

export async function rotateExportTokenAction(propertyId: string): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { actor } = await context("integrations:manage");
    await prisma.property.update({ where: { id: propertyId }, data: { icalExportToken: randomBytes(24).toString("base64url") } });
    await audit(prisma, actor, "property.export_token_rotated", { type: "Property", id: propertyId });
    refresh();
    return undefined;
  });
}

// ─── Publishing ───────────────────────────────────────────────────────────────

export async function setPropertyStatusAction(propertyId: string, status: "DRAFT" | "PUBLISHED" | "PAUSED" | "ARCHIVED"): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { actor } = await context();
    if (status === "PUBLISHED") {
      const checklist = await getPublishChecklist(propertyId);
      const missing = Object.entries(checklist).filter(([, done]) => !done).map(([key]) => key);
      if (missing.length) throw new ActionError("INVALID_STATE", { missing });
    }
    await prisma.property.update({
      where: { id: propertyId },
      data: { status, ...(status === "PUBLISHED" ? { publishedAt: new Date() } : {}) },
    });
    await audit(prisma, actor, "property.status_changed", { type: "Property", id: propertyId }, { status });
    refresh();
    return undefined;
  });
}

/** Hard delete only when no reservation ever referenced the property; otherwise archive it. */
export async function deletePropertyAction(propertyId: string): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const { actor } = await context("properties:delete");
    const reservations = await prisma.reservation.count({ where: { propertyId } });
    if (reservations > 0) throw new ActionError("HAS_RESERVATIONS");
    const images = await prisma.propertyImage.findMany({ where: { propertyId, storageKey: { not: null } }, select: { storageKey: true } });
    await prisma.property.delete({ where: { id: propertyId } });
    await Promise.all(images.map((image) => storage().delete("public", image.storageKey!).catch(() => undefined)));
    await audit(prisma, actor, "property.deleted", { type: "Property", id: propertyId });
    return undefined;
  });
}
