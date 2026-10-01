"use server";

import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { type ActionResult, ActionError, parseInput, runAction } from "@/server/action-result";
import { audit } from "@/server/audit";
import { requireActionUser } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { getClientIp } from "@/server/request";

const text = (max: number) => z.string().trim().max(max);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || null);

const ownerSchema = z.object({
  firstName: text(60).min(1),
  lastName: text(60).min(1),
  email: z.email().trim().toLowerCase().max(120),
  phone: optional(40),
  taxId: optional(20),
  bankName: optional(80),
  accountHolder: optional(120),
  cbu: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value.replace(/\s/g, "") : null))
    .refine((value) => value === null || /^\d{22}$/.test(value), { message: "invalid" }),
  alias: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value.toUpperCase() : null))
    .refine((value) => value === null || /^[A-Z0-9.-]{6,20}$/.test(value), { message: "invalid" }),
  accountTaxId: optional(20),
  commissionPercent: z.coerce.number().min(0).max(100),
  notes: optional(2000),
});

export type OwnerInput = z.input<typeof ownerSchema>;

export async function saveOwnerAction(id: string | null, input: OwnerInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireActionUser("owners:write");
    const t = await getTranslations("validation");
    const data = parseInput(ownerSchema, input, t);
    const values = { ...data, commissionPercent: data.commissionPercent.toFixed(2) };
    const owner = id ? await prisma.owner.update({ where: { id }, data: values }) : await prisma.owner.create({ data: values });
    await audit(prisma, { type: "USER", id: user.id, ip: await getClientIp() }, id ? "owner.updated" : "owner.created", { type: "Owner", id: owner.id }, {
      // Bank changes are the most sensitive edit: record which fields changed, never their values.
      bankFields: ["bankName", "accountHolder", "cbu", "alias", "accountTaxId"].filter((key) => data[key as keyof typeof data] !== undefined),
    });
    refresh();
    return { id: owner.id };
  });
}

export async function deleteOwnerAction(id: string): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireActionUser("owners:write");
    const properties = await prisma.property.count({ where: { ownerId: id } });
    if (properties > 0) throw new ActionError("INVALID_STATE", { properties });
    await prisma.owner.delete({ where: { id } });
    await audit(prisma, { type: "USER", id: user.id, ip: await getClientIp() }, "owner.deleted", { type: "Owner", id });
    return undefined;
  });
}

const guestSchema = z.object({
  firstName: text(60).min(1),
  lastName: text(60).min(1),
  phone: text(40).min(7),
  country: optional(60),
  notes: optional(2000),
});

export async function saveGuestAction(id: string, input: z.input<typeof guestSchema>): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireActionUser("reservations:write");
    const t = await getTranslations("validation");
    const data = parseInput(guestSchema, input, t);
    await prisma.guest.update({ where: { id }, data });
    await audit(prisma, { type: "USER", id: user.id, ip: await getClientIp() }, "guest.updated", { type: "Guest", id });
    refresh();
    return undefined;
  });
}
