import "server-only";
import { cache } from "react";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Locale } from "@/i18n/config";
import type { Db } from "./db";
import { prisma } from "./db";

/**
 * Business settings editable from the admin panel (no code changes needed).
 * Each group is stored as one JSON row in `Setting`; missing fields fall back to defaults.
 */

const text = z.string().max(20_000).default("");
const localizedText = z.object({ es: text, en: text, pt: text }) satisfies z.ZodType<Record<Locale, string>>;

export const agencySchema = z.object({
  name: z.string().trim().min(2).max(80).default("DestinoCalamuchita"),
  legalName: z.string().trim().max(120).default(""),
  taxId: z.string().trim().max(20).default(""),
  email: z.string().trim().max(120).default(""),
  phone: z.string().trim().max(40).default(""),
  whatsapp: z.string().trim().max(40).default(""),
  address: z.string().trim().max(160).default(""),
  city: z.string().trim().max(80).default(""),
  instagram: z.string().trim().max(80).default(""),
});

export const bookingSchema = z.object({
  holdHours: z.coerce.number().int().min(1).max(168).default(24),
  reminderDaysBefore: z.coerce.number().int().min(1).max(14).default(2),
});

export const bankSchema = z.object({
  bankName: z.string().trim().max(80).default(""),
  accountHolder: z.string().trim().max(120).default(""),
  cbu: z.string().trim().max(30).default(""),
  alias: z.string().trim().max(40).default(""),
  accountTaxId: z.string().trim().max(20).default(""),
});

export const notificationsSchema = z.object({
  adminEmails: z.array(z.email()).max(10).default([]),
});

export const policiesSchema = z.object({
  cancellation: localizedText.default({ es: "", en: "", pt: "" }),
  terms: localizedText.default({ es: "", en: "", pt: "" }),
});

/** Cover photo per destination (city) shown on the home page; cities come from the properties. */
export const destinationsSchema = z.object({
  images: z
    .array(z.object({ city: z.string().trim().min(1).max(80), imageUrl: z.url().max(500) }))
    .max(30)
    .default([]),
});

/** Home page imagery (falls back to property photos when empty). */
export const siteSchema = z.object({
  heroImageUrl: z.union([z.url().max(500), z.literal("")]).default(""),
  ctaImageUrl: z.union([z.url().max(500), z.literal("")]).default(""),
});

/** Guest quotes shown on the home page. The section is hidden when the list is empty. */
export const testimonialsSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        origin: z.string().trim().max(60).default(""),
        quote: localizedText,
      }),
    )
    .max(12)
    .default([]),
});

const groups = {
  site: siteSchema,
  testimonials: testimonialsSchema,
  agency: agencySchema,
  booking: bookingSchema,
  bank: bankSchema,
  notifications: notificationsSchema,
  policies: policiesSchema,
  destinations: destinationsSchema,
} as const;

export type SettingGroup = keyof typeof groups;
export type Settings = { [K in SettingGroup]: z.output<(typeof groups)[K]> };

export async function loadSettings(db: Db = prisma): Promise<Settings> {
  const rows = await db.setting.findMany({ where: { key: { in: Object.keys(groups) } } });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  return Object.fromEntries(
    (Object.keys(groups) as SettingGroup[]).map((key) => {
      const parsed = groups[key].safeParse(byKey.get(key) ?? {});
      return [key, parsed.success ? parsed.data : groups[key].parse({})];
    }),
  ) as Settings;
}

/** Request-deduplicated settings for Server Components. */
export const getSettings = cache(() => loadSettings());

export async function saveSettingGroup<K extends SettingGroup>(key: K, value: unknown, db: Db = prisma): Promise<Settings[K]> {
  const parsed = groups[key].parse(value) as Settings[K];
  await db.setting.upsert({
    where: { key },
    create: { key, value: parsed as Prisma.InputJsonValue },
    update: { value: parsed as Prisma.InputJsonValue },
  });
  return parsed;
}
