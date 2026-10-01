import "server-only";
import { getLocale } from "next-intl/server";
import type { Prisma } from "@/generated/prisma/client";
import { redirect } from "@/i18n/navigation";
import { ActionError } from "../action-result";
import { type Permission, can } from "./permissions";
import { type SessionUser, getCurrentUser } from "./session";

/** For admin pages: redirects to login (or the dashboard) instead of rendering. */
export async function requirePageUser(permission?: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  const locale = await getLocale();
  if (!user) return redirect({ href: "/login", locale });
  if (permission && !can(user.role, permission)) return redirect({ href: "/admin", locale });
  return user;
}

/** For Server Actions and Route Handlers: throws, never trusts the UI to have hidden the button. */
export async function requireActionUser(permission: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new ActionError("UNAUTHORIZED");
  if (!can(user.role, permission)) throw new ActionError("FORBIDDEN");
  return user;
}

/** Owners only ever see their own properties. */
export function propertyScope(user: SessionUser): Prisma.PropertyWhereInput {
  if (user.role !== "OWNER") return {};
  return { ownerId: user.ownerId ?? "__no_owner__" };
}
