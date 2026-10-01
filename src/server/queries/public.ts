import "server-only";
import type { Prisma, PropertyType } from "@/generated/prisma/client";
import type { Locale } from "@/i18n/config";
import { findConflicts } from "@/lib/availability";
import { type ISODate, addDays, isValidISODate, todayISO } from "@/lib/dates";
import { type Cents, toCents } from "@/lib/money";
import { type PricingConfig, calculateQuote, fromPrice } from "@/lib/pricing";
import { loadBlockedRanges, toPublicRanges } from "../booking/availability";
import { toPricingConfig } from "../booking/pricing-config";
import { prisma } from "../db";
import { getSettings } from "../settings";

export interface CardImage {
  url: string;
  alt: string;
  width: number;
  height: number;
}

export interface PropertyCardData {
  id: string;
  slug: string;
  title: string;
  summary: string;
  city: string;
  region: string;
  type: PropertyType;
  maxGuests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  images: CardImage[];
  fromPrice: Cents;
  currency: "ARS" | "USD";
  ratingAverage: number | null;
  ratingCount: number;
  featured: boolean;
  isNew: boolean;
  /** Present when the search had dates. */
  stay: { available: boolean; total: Cents | null; nights: number } | null;
}

const NEW_FOR_DAYS = 60;

const cardInclude = (locale: Locale) =>
  ({
    images: { orderBy: { position: "asc" }, take: 4 },
    translations: { where: { locale } },
    seasons: true,
    priceRules: true,
  }) satisfies Prisma.PropertyInclude;

type CardRow = Prisma.PropertyGetPayload<{ include: ReturnType<typeof cardInclude> }>;

function localized<T extends { title: string; summary: string }>(row: T & { translations: { title: string | null; summary: string | null }[] }) {
  const translation = row.translations[0];
  return { title: translation?.title || row.title, summary: translation?.summary || row.summary };
}

function toCard(row: CardRow, config: PricingConfig, stay: PropertyCardData["stay"]): PropertyCardData {
  const text = localized(row);
  return {
    id: row.id,
    slug: row.slug,
    title: text.title,
    summary: text.summary,
    city: row.city,
    region: row.region,
    type: row.type,
    maxGuests: row.maxGuests,
    bedrooms: row.bedrooms,
    beds: row.beds,
    bathrooms: Number(row.bathrooms),
    images: row.images.map(({ url, alt, width, height }) => ({ url, alt: alt || text.title, width, height })),
    fromPrice: fromPrice(config),
    currency: row.currency,
    ratingAverage: row.ratingAverage === null ? null : Number(row.ratingAverage),
    ratingCount: row.ratingCount,
    featured: row.featured,
    isNew: Boolean(row.publishedAt && row.publishedAt.getTime() > Date.now() - NEW_FOR_DAYS * 86_400_000),
    stay,
  };
}

// ─── Catalog search ───────────────────────────────────────────────────────────

export type SortKey = "recommended" | "price_asc" | "price_desc" | "newest" | "rating";

export interface SearchFilters {
  q?: string;
  city?: string;
  type?: PropertyType;
  guests?: number;
  bedrooms?: number;
  priceMin?: number;
  priceMax?: number;
  amenities?: string[];
  checkIn?: ISODate;
  checkOut?: ISODate;
  sort?: SortKey;
}

export interface SearchResult {
  items: PropertyCardData[];
  total: number;
  /** Properties hidden because they are not free for the chosen dates. */
  unavailableCount: number;
}

export async function searchProperties(filters: SearchFilters, locale: Locale): Promise<SearchResult> {
  const where: Prisma.PropertyWhereInput = { status: "PUBLISHED" };
  const and: Prisma.PropertyWhereInput[] = [];
  if (filters.q) {
    const q = filters.q.trim().slice(0, 80);
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
        { translations: { some: { locale, title: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  if (filters.city) and.push({ city: { equals: filters.city, mode: "insensitive" } });
  if (filters.type) and.push({ type: filters.type });
  if (filters.guests) and.push({ maxGuests: { gte: filters.guests } });
  if (filters.bedrooms) and.push({ bedrooms: { gte: filters.bedrooms } });
  if (filters.priceMin) and.push({ basePrice: { gte: filters.priceMin } });
  if (filters.priceMax) and.push({ basePrice: { lte: filters.priceMax } });
  for (const key of filters.amenities ?? []) and.push({ amenities: { some: { amenity: { key } } } });
  if (and.length) where.AND = and;

  const orderBy: Prisma.PropertyOrderByWithRelationInput[] =
    filters.sort === "price_asc"
      ? [{ basePrice: "asc" }]
      : filters.sort === "price_desc"
        ? [{ basePrice: "desc" }]
        : filters.sort === "newest"
          ? [{ publishedAt: { sort: "desc", nulls: "last" } }]
          : filters.sort === "rating"
            ? [{ ratingAverage: { sort: "desc", nulls: "last" } }, { ratingCount: "desc" }]
            : [{ featured: "desc" }, { ratingAverage: { sort: "desc", nulls: "last" } }, { publishedAt: "desc" }];

  const rows = await prisma.property.findMany({ where, orderBy, include: cardInclude(locale), take: 200 });

  const hasDates =
    filters.checkIn && filters.checkOut && isValidISODate(filters.checkIn) && isValidISODate(filters.checkOut) && filters.checkOut > filters.checkIn;
  if (!hasDates) {
    const items = rows.map((row) => toCard(row, toPricingConfig(row, row.seasons, row.priceRules), null));
    return { items, total: items.length, unavailableCount: 0 };
  }

  const checkIn = filters.checkIn!;
  const checkOut = filters.checkOut!;
  const ranges = await loadBlockedRanges(prisma, rows.map((r) => r.id), checkIn, checkOut);
  const today = todayISO();
  const items: PropertyCardData[] = [];
  let unavailableCount = 0;
  for (const row of rows) {
    const config = toPricingConfig(row, row.seasons, row.priceRules);
    const free = findConflicts(ranges.get(row.id) ?? [], checkIn, checkOut).length === 0;
    const quote = calculateQuote({ checkIn, checkOut, guests: filters.guests ?? 1, today }, config);
    if (!free || !quote.ok) {
      unavailableCount++;
      continue;
    }
    items.push(toCard(row, config, { available: true, total: quote.quote.total, nights: quote.quote.nights }));
  }
  if (filters.sort === "price_asc" || filters.sort === "price_desc") {
    const dir = filters.sort === "price_asc" ? 1 : -1;
    items.sort((a, b) => dir * ((a.stay?.total ?? a.fromPrice) - (b.stay?.total ?? b.fromPrice)));
  }
  return { items, total: items.length, unavailableCount };
}

export async function getSearchFacets() {
  const [cities, amenities, bounds] = await Promise.all([
    prisma.property.groupBy({ by: ["city"], where: { status: "PUBLISHED" }, _count: { _all: true }, orderBy: { city: "asc" } }),
    prisma.amenity.findMany({
      where: { properties: { some: { property: { status: "PUBLISHED" } } } },
      orderBy: [{ category: "asc" }, { label: "asc" }],
    }),
    prisma.property.aggregate({ where: { status: "PUBLISHED" }, _min: { basePrice: true }, _max: { basePrice: true } }),
  ]);
  return {
    cities: cities.map((c) => ({ city: c.city, count: c._count._all })),
    amenities: amenities.map((a) => ({ key: a.key, label: a.label, icon: a.icon })),
    priceRange: { min: toCents(bounds._min.basePrice ?? 0) / 100, max: toCents(bounds._max.basePrice ?? 0) / 100 },
  };
}

// ─── Home ─────────────────────────────────────────────────────────────────────

export interface Destination {
  city: string;
  region: string;
  count: number;
  image: CardImage | null;
}

export async function getHomeData(locale: Locale) {
  const [rows, settings] = await Promise.all([
    prisma.property.findMany({ where: { status: "PUBLISHED" }, include: cardInclude(locale) }),
    getSettings(),
  ]);
  const cards = rows.map((row) => toCard(row, toPricingConfig(row, row.seasons, row.priceRules), null));

  const featured = cards.filter((c) => c.featured).slice(0, 3);
  const newest = [...rows]
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .map((row) => cards.find((c) => c.id === row.id)!)
    .slice(0, 4);
  const recommended = [...cards]
    .filter((c) => !featured.some((f) => f.id === c.id))
    .sort((a, b) => (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0) || b.ratingCount - a.ratingCount)
    .slice(0, 3);

  const byCity = new Map<string, Destination>();
  for (const card of cards) {
    const entry = byCity.get(card.city) ?? { city: card.city, region: card.region, count: 0, image: null };
    entry.count++;
    entry.image ??= card.images[0] ?? null;
    byCity.set(card.city, entry);
  }
  for (const { city, imageUrl } of settings.destinations.images) {
    const entry = byCity.get(city);
    if (entry) entry.image = { url: imageUrl, alt: city, width: 1600, height: 1067 };
  }
  const destinations = [...byCity.values()].sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));

  return { featured, newest, recommended, destinations, cities: destinations.map((d) => d.city), total: cards.length };
}

// ─── Property page ────────────────────────────────────────────────────────────

/** How far ahead the public calendar shows availability. */
export const PUBLIC_CALENDAR_DAYS = 540;

export async function getPublicProperty(slug: string, locale: Locale) {
  const row = await prisma.property.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { position: "asc" } },
      translations: { where: { locale } },
      amenities: { include: { amenity: true } },
      seasons: { orderBy: { startDate: "asc" } },
      priceRules: true,
    },
  });
  if (!row || row.status !== "PUBLISHED") return null;

  const today = todayISO();
  const ranges = (await loadBlockedRanges(prisma, [row.id], today, addDays(today, PUBLIC_CALENDAR_DAYS))).get(row.id) ?? [];
  const translation = row.translations[0];
  const config = toPricingConfig(row, row.seasons, row.priceRules);

  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    title: translation?.title || row.title,
    summary: translation?.summary || row.summary,
    description: translation?.description || row.description,
    houseRules: translation?.houseRules || row.houseRules,
    cancellationPolicy: translation?.cancellationPolicy || row.cancellationPolicy,
    city: row.city,
    region: row.region,
    country: row.country,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    maxGuests: row.maxGuests,
    bedrooms: row.bedrooms,
    beds: row.beds,
    bathrooms: Number(row.bathrooms),
    areaM2: row.areaM2,
    checkInTime: row.checkInTime,
    checkOutTime: row.checkOutTime,
    videoUrl: row.videoUrl,
    ratingAverage: row.ratingAverage === null ? null : Number(row.ratingAverage),
    ratingCount: row.ratingCount,
    images: row.images.map(({ id, url, alt, width, height }) => ({ id, url, alt: alt || row.title, width, height })),
    amenities: row.amenities
      .map(({ amenity }) => ({ key: amenity.key, label: amenity.label, icon: amenity.icon, category: amenity.category }))
      .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label)),
    pricing: config,
    fromPrice: fromPrice(config),
    blocked: toPublicRanges(ranges),
    today,
    updatedAt: row.updatedAt,
  };
}

export type PublicProperty = NonNullable<Awaited<ReturnType<typeof getPublicProperty>>>;

export async function listPublishedSlugs() {
  return prisma.property.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } });
}
