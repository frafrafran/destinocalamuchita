import type { UserRole } from "@/generated/prisma/enums";

/**
 * Role → permission matrix. Every Server Action and protected Route Handler checks one of these;
 * the admin navigation uses the same table to hide what a role cannot open.
 */
const MATRIX = {
  "dashboard:view": ["ADMIN", "MANAGER", "OWNER"],
  "properties:read": ["ADMIN", "MANAGER", "OWNER"],
  "properties:write": ["ADMIN", "MANAGER"],
  "properties:delete": ["ADMIN"],
  "reservations:read": ["ADMIN", "MANAGER", "OWNER"],
  "reservations:write": ["ADMIN", "MANAGER"],
  "calendar:read": ["ADMIN", "MANAGER", "OWNER"],
  "calendar:write": ["ADMIN", "MANAGER"],
  "guests:read": ["ADMIN", "MANAGER"],
  "owners:read": ["ADMIN", "MANAGER"],
  "owners:write": ["ADMIN"],
  "payments:read": ["ADMIN", "MANAGER"],
  "payments:review": ["ADMIN", "MANAGER"],
  "integrations:manage": ["ADMIN", "MANAGER"],
  "settings:manage": ["ADMIN"],
  "users:manage": ["ADMIN"],
  "audit:read": ["ADMIN"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof MATRIX;

export function can(role: UserRole, permission: Permission): boolean {
  return (MATRIX[permission] as readonly UserRole[]).includes(role);
}

export const STAFF_ROLES: readonly UserRole[] = ["ADMIN", "MANAGER", "OWNER"];
