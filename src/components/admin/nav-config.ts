import type { Permission } from "@/server/auth/permissions";

/** Admin sections and the permission each requires (shared by the server layout and the client nav). */
export const ADMIN_SECTIONS = [
  { href: "/admin", key: "dashboard", permission: "dashboard:view" },
  { href: "/admin/reservas", key: "reservations", permission: "reservations:read" },
  { href: "/admin/calendario", key: "calendar", permission: "calendar:read" },
  { href: "/admin/propiedades", key: "properties", permission: "properties:read" },
  { href: "/admin/pagos", key: "payments", permission: "payments:read" },
  { href: "/admin/huespedes", key: "guests", permission: "guests:read" },
  { href: "/admin/propietarios", key: "owners", permission: "owners:read" },
  { href: "/admin/disponibilidad", key: "availability", permission: "integrations:manage" },
  { href: "/admin/configuracion", key: "settings", permission: "settings:manage" },
] as const satisfies readonly { href: string; key: string; permission: Permission }[];

export type AdminNavKey = (typeof ADMIN_SECTIONS)[number]["key"];
