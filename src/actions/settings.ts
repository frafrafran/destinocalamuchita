"use server";

import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { type ActionResult, ActionError, parseInput, runAction } from "@/server/action-result";
import { audit } from "@/server/audit";
import { hashPassword, verifyPassword } from "@/server/auth/crypto";
import { requireActionUser } from "@/server/auth/guard";
import { getCurrentUser, revokeUserSessions } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getClientIp } from "@/server/request";
import {
  type SettingGroup,
  agencySchema,
  bankSchema,
  bookingSchema,
  destinationsSchema,
  notificationsSchema,
  policiesSchema,
  saveSettingGroup,
  siteSchema,
  testimonialsSchema,
} from "@/server/settings";

const SCHEMAS = {
  agency: agencySchema,
  booking: bookingSchema,
  bank: bankSchema,
  notifications: notificationsSchema,
  policies: policiesSchema,
  site: siteSchema,
  destinations: destinationsSchema,
  testimonials: testimonialsSchema,
} as const satisfies Record<SettingGroup, z.ZodType>;

export async function saveSettingsAction(group: SettingGroup, value: unknown): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireActionUser("settings:manage");
    const t = await getTranslations("validation");
    const schema = SCHEMAS[group];
    if (!schema) throw new ActionError("NOT_FOUND");
    const data = parseInput(schema, value, t);
    await saveSettingGroup(group, data);
    await audit(prisma, { type: "USER", id: user.id, ip: await getClientIp() }, "settings.updated", { type: "Setting", id: group });
    refresh();
    return undefined;
  });
}

// ─── Users ────────────────────────────────────────────────────────────────────

const password = z.string().min(10).max(200);

const createUserSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.email().trim().toLowerCase().max(120),
    role: z.enum(["ADMIN", "MANAGER", "OWNER"]),
    ownerId: z.string().optional(),
    password,
  })
  .refine((value) => value.role !== "OWNER" || Boolean(value.ownerId), { path: ["ownerId"], message: "required" });

export async function createUserAction(input: z.input<typeof createUserSchema>): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const admin = await requireActionUser("users:manage");
    const t = await getTranslations("validation");
    const data = parseInput(createUserSchema, input, t);
    if (await prisma.user.findUnique({ where: { email: data.email } })) throw new ActionError("DUPLICATE", undefined, { email: t("invalid") });
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: data.role,
        ownerId: data.role === "OWNER" ? data.ownerId : null,
        passwordHash: await hashPassword(data.password),
      },
    });
    await audit(prisma, { type: "USER", id: admin.id, ip: await getClientIp() }, "user.created", { type: "User", id: user.id }, { role: data.role });
    refresh();
    return undefined;
  });
}

const updateUserSchema = z.object({
  role: z.enum(["ADMIN", "MANAGER", "OWNER"]),
  ownerId: z.string().optional(),
  isActive: z.boolean(),
  newPassword: z.union([z.literal(""), password]).optional(),
});

export async function updateUserAction(id: string, input: z.input<typeof updateUserSchema>): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const admin = await requireActionUser("users:manage");
    const t = await getTranslations("validation");
    const data = parseInput(updateUserSchema, input, t);
    if (id === admin.id && (!data.isActive || data.role !== "ADMIN")) {
      // Never let the last line of defence lock itself out.
      throw new ActionError("INVALID_STATE", { reason: "SELF_DEMOTION" });
    }
    if (data.role === "OWNER" && !data.ownerId) throw new ActionError("VALIDATION", undefined, { ownerId: t("required") });
    await prisma.user.update({
      where: { id },
      data: {
        role: data.role,
        ownerId: data.role === "OWNER" ? data.ownerId : null,
        isActive: data.isActive,
        ...(data.newPassword ? { passwordHash: await hashPassword(data.newPassword) } : {}),
      },
    });
    if (!data.isActive || data.newPassword) await revokeUserSessions(id);
    await audit(prisma, { type: "USER", id: admin.id, ip: await getClientIp() }, "user.updated", { type: "User", id }, {
      role: data.role,
      isActive: data.isActive,
      passwordReset: Boolean(data.newPassword),
    });
    refresh();
    return undefined;
  });
}

const changePasswordSchema = z
  .object({ current: z.string().min(1), next: password, confirm: z.string() })
  .refine((value) => value.next === value.confirm, { path: ["confirm"], message: "invalid" });

/** Any staff member can change their own password; every other session is signed out. */
export async function changeOwnPasswordAction(input: z.input<typeof changePasswordSchema>): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const session = await getCurrentUser();
    if (!session) throw new ActionError("UNAUTHORIZED");
    const t = await getTranslations("validation");
    const data = parseInput(changePasswordSchema, input, t);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });
    if (!(await verifyPassword(user.passwordHash, data.current))) throw new ActionError("INVALID_CREDENTIALS", undefined, { current: t("invalid") });
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(data.next) } });
    await prisma.session.deleteMany({ where: { userId: user.id, id: { not: session.sessionId } } });
    await audit(prisma, { type: "USER", id: user.id, ip: await getClientIp() }, "user.password_changed", { type: "User", id: user.id });
    return undefined;
  });
}
