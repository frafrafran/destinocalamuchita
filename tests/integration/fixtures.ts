import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db";

export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(", ");
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

export async function createStaffUser(role: "ADMIN" | "MANAGER" = "ADMIN") {
  return prisma.user.create({
    data: { email: `${role.toLowerCase()}-${randomUUID()}@test.local`, name: "Test Staff", passwordHash: "x", role },
  });
}

export async function createProperty(overrides: { basePrice?: string; minNights?: number; maxGuests?: number } = {}) {
  const owner = await prisma.owner.create({
    data: {
      firstName: "Olga",
      lastName: "Ferreyra",
      email: `owner-${randomUUID()}@test.local`,
      bankName: "Banco de Córdoba",
      accountHolder: "Olga Ferreyra",
      cbu: "0200000011000000000001",
      alias: "casa.lago.test",
      accountTaxId: "27-11111111-3",
    },
  });
  return prisma.property.create({
    data: {
      slug: `test-${randomUUID()}`,
      title: "Casa de prueba",
      status: "PUBLISHED",
      city: "Villa General Belgrano",
      maxGuests: overrides.maxGuests ?? 6,
      bedrooms: 3,
      beds: 4,
      bathrooms: "2",
      basePrice: overrides.basePrice ?? "100000",
      cleaningFee: "20000",
      minNights: overrides.minNights ?? 2,
      icalExportToken: randomUUID(),
      ownerId: owner.id,
    },
  });
}

export const guest = (n = 1) => ({
  firstName: "Lucía",
  lastName: `Paredes ${n}`,
  email: `guest${n}@test.local`,
  phone: "+54 9 351 555 0101",
});
