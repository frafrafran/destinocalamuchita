"use client";

import {
  ArrowsClockwiseIcon,
  CalendarCheckIcon,
  CalendarDotsIcon,
  GearSixIcon,
  HouseLineIcon,
  IdentificationBadgeIcon,
  type Icon,
  ReceiptIcon,
  SquaresFourIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ADMIN_SECTIONS, type AdminNavKey } from "./nav-config";

const ICONS: Record<AdminNavKey, Icon> = {
  dashboard: SquaresFourIcon,
  reservations: CalendarCheckIcon,
  calendar: CalendarDotsIcon,
  properties: HouseLineIcon,
  payments: ReceiptIcon,
  guests: UsersIcon,
  owners: IdentificationBadgeIcon,
  availability: ArrowsClockwiseIcon,
  settings: GearSixIcon,
};

export function AdminNav({ allowed, counts, onNavigate }: { allowed: AdminNavKey[]; counts: Partial<Record<AdminNavKey, number>>; onNavigate?: () => void }) {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="flex flex-col gap-0.5">
      {ADMIN_SECTIONS.filter((item) => allowed.includes(item.key)).map(({ href, key }) => {
        const Icon = ICONS[key];
        const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
        const count = counts[key];
        return (
          <Link
            key={key}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-surface text-ink shadow-soft" : "text-ink-2 hover:bg-surface/60 hover:text-ink",
            )}
          >
            <Icon size={19} weight={active ? "fill" : "regular"} className={active ? "text-accent-text" : "text-ink-3 group-hover:text-ink-2"} />
            <span className="flex-1">{t(key)}</span>
            {count ? (
              <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-ink" aria-label={t("pendingCount", { count })}>
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
