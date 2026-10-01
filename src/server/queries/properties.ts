import "server-only";
import { addDays, fromDbDate, todayISO, toDbDate } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { BLOCKING_STATUSES } from "@/lib/reservation-status";
import { propertyScope } from "../auth/guard";
import type { SessionUser } from "../auth/session";
import { prisma } from "../db";
import { absoluteUrl } from "../env";
import { loadSettings } from "../settings";

export interface PublishChecklist {
  photos: boolean;
  price: boolean;
  description: boolean;
  location: boolean;
  bank: boolean;
}

/** What a property needs before it can be published. */
export async function getPublishChecklist(propertyId: string): Promise<PublishChecklist> {
  const [property, settings] = await Promise.all([
    prisma.property.findUniqueOrThrow({ where: { id: propertyId }, include: { owner: true, _count: { select: { images: true } } } }),
    loadSettings(),
  ]);
  return {
    photos: property._count.images >= 3,
    price: toCents(property.basePrice) > 0,
    description: property.description.trim().length >= 40,
    location: Boolean(property.city && property.latitude !== null && property.longitude !== null),
    bank: Boolean(property.owner?.cbu || property.owner?.alias || settings.bank.cbu || settings.bank.alias),
  };
}

export async function listAdminProperties(user: SessionUser) {
  const today = todayISO();
  const properties = await prisma.property.findMany({
    where: propertyScope(user),
    orderBy: [{ status: "asc" }, { title: "asc" }],
    include: {
      images: { orderBy: { position: "asc" }, take: 1 },
      owner: { select: { firstName: true, lastName: true } },
      calendarIntegrations: { select: { channel: true, isActive: true, lastSyncStatus: true } },
      reservations: {
        where: { status: { in: [...BLOCKING_STATUSES] }, checkOut: { gt: toDbDate(today) } },
        orderBy: { checkIn: "asc" },
        take: 1,
        select: { checkIn: true, checkOut: true, code: true },
      },
      _count: { select: { reservations: true } },
    },
  });
  return properties.map((property) => ({
    id: property.id,
    title: property.title,
    slug: property.slug,
    city: property.city,
    type: property.type,
    status: property.status,
    featured: property.featured,
    image: property.images[0] ?? null,
    basePrice: toCents(property.basePrice),
    currency: property.currency,
    maxGuests: property.maxGuests,
    owner: property.owner ? `${property.owner.firstName} ${property.owner.lastName}` : null,
    channels: property.calendarIntegrations,
    next: property.reservations[0]
      ? { checkIn: fromDbDate(property.reservations[0].checkIn), checkOut: fromDbDate(property.reservations[0].checkOut), code: property.reservations[0].code }
      : null,
    occupiedNow: Boolean(property.reservations[0] && fromDbDate(property.reservations[0].checkIn) <= today),
    reservations: property._count.reservations,
  }));
}

/** Everything the property editor needs, across all wizard steps. */
export async function getPropertyEditor(user: SessionUser, id: string) {
  const property = await prisma.property.findFirst({
    where: { id, ...propertyScope(user) },
    include: {
      images: { orderBy: { position: "asc" } },
      translations: true,
      amenities: true,
      seasons: { orderBy: { startDate: "asc" } },
      priceRules: { orderBy: [{ type: "asc" }, { startDate: "asc" }] },
      calendarIntegrations: { orderBy: { createdAt: "asc" }, include: { _count: { select: { events: true } } } },
      availability: { where: { endDate: { gt: toDbDate(addDays(todayISO(), -1)) } }, orderBy: { startDate: "asc" } },
      _count: { select: { reservations: true } },
    },
  });
  if (!property) return null;
  const [amenities, owners, checklist] = await Promise.all([
    prisma.amenity.findMany({ orderBy: [{ category: "asc" }, { label: "asc" }] }),
    user.role === "OWNER" ? Promise.resolve([]) : prisma.owner.findMany({ orderBy: [{ lastName: "asc" }], select: { id: true, firstName: true, lastName: true } }),
    getPublishChecklist(property.id),
  ]);
  return {
    property,
    amenities,
    owners,
    checklist,
    exportUrl: absoluteUrl(`/api/ical/${property.icalExportToken}`),
  };
}

export type PropertyEditorData = NonNullable<Awaited<ReturnType<typeof getPropertyEditor>>>;

export async function listOwnerOptions() {
  return prisma.owner.findMany({ orderBy: [{ lastName: "asc" }], select: { id: true, firstName: true, lastName: true } });
}
