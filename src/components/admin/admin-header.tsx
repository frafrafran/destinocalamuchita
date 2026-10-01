"use client";

import { ArrowSquareOutIcon, BellIcon, ListIcon, MagnifyingGlassIcon, SignOutIcon, UserCircleIcon, XIcon } from "@phosphor-icons/react";
import { Dialog as RadixDialog } from "radix-ui";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { logoutAction } from "@/actions/auth";
import { markNotificationsReadAction } from "@/actions/notifications";
import { Logo } from "@/components/site/logo";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/primitives";
import { Link, useRouter } from "@/i18n/navigation";
import { useNow } from "@/lib/use-now";
import { cn, initials } from "@/lib/utils";
import { AdminNav } from "./admin-nav";
import type { AdminNavKey } from "./nav-config";

export interface HeaderNotification {
  id: string;
  title: string;
  detail: string;
  href: string;
  createdAt: string;
  unread: boolean;
}

interface Props {
  agencyName: string;
  user: { name: string; email: string; role: string };
  notifications: HeaderNotification[];
  unread: number;
  allowed: AdminNavKey[];
  counts: Partial<Record<AdminNavKey, number>>;
}

export function AdminHeader({ agencyName, user, notifications, unread, allowed, counts }: Props) {
  const t = useTranslations("admin.header");
  const locale = useLocale();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();
  const time = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const now = useNow(60_000);

  function relative(iso: string) {
    if (now === null) return "";
    const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
    if (Math.abs(minutes) < 60) return time.format(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return time.format(hours, "hour");
    return time.format(Math.round(hours / 24), "day");
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-xl sm:px-6">
      <RadixDialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <RadixDialog.Trigger className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-surface-2 lg:hidden" aria-label={t("openMenu")}>
          <ListIcon size={20} />
        </RadixDialog.Trigger>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-[fade-in_180ms_ease-out]" />
          <RadixDialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-surface-2 p-4 shadow-float data-[state=open]:animate-[fade-in_200ms_ease-out]">
            <div className="mb-6 flex items-center justify-between">
              <RadixDialog.Title asChild>
                <span>
                  <Logo name={agencyName} />
                </span>
              </RadixDialog.Title>
              <RadixDialog.Description className="sr-only">{t("menu")}</RadixDialog.Description>
              <RadixDialog.Close className="grid size-9 place-items-center rounded-full hover:bg-surface" aria-label={t("closeMenu")}>
                <XIcon size={18} />
              </RadixDialog.Close>
            </div>
            <AdminNav allowed={allowed} counts={counts} onNavigate={() => setMenuOpen(false)} />
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>

      <form
        role="search"
        className="relative max-w-md flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim()) router.push(`/admin/reservas?q=${encodeURIComponent(query.trim())}`);
        }}
      >
        <MagnifyingGlassIcon size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          className="h-10 w-full rounded-full border border-line bg-surface pr-4 pl-10 text-sm placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent/15 focus:outline-none"
        />
      </form>

      <div className="ml-auto flex items-center gap-1">
        <Link href="/" target="_blank" className="hidden h-10 items-center gap-1.5 rounded-full px-3 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink sm:inline-flex">
          <ArrowSquareOutIcon size={16} />
          {t("viewSite")}
        </Link>

        <Popover>
          <PopoverTrigger className="relative grid size-10 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={t("notifications", { count: unread })}>
            <BellIcon size={20} />
            {unread ? <span className="tabular absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger-fg px-1 text-[10px] font-semibold text-surface">{unread}</span> : null}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(380px,calc(100vw-2rem))] p-0">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-semibold">{t("notificationsTitle")}</p>
              {unread ? (
                <button type="button" className="text-xs font-medium text-accent-text hover:underline" onClick={() => startTransition(async () => void (await markNotificationsReadAction()))}>
                  {t("markAllRead")}
                </button>
              ) : null}
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? <li className="px-4 py-8 text-center text-sm text-ink-3">{t("noNotifications")}</li> : null}
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <Link
                    href={notification.href}
                    onClick={() => notification.unread && startTransition(async () => void (await markNotificationsReadAction([notification.id])))}
                    className={cn("flex gap-3 border-b border-line px-4 py-3 text-sm last:border-0 hover:bg-surface-2", notification.unread && "bg-accent-soft/40")}
                  >
                    <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", notification.unread ? "bg-accent" : "bg-transparent")} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">{notification.title}</span>
                      <span className="block truncate text-ink-3">{notification.detail}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-3">
                      {relative(notification.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>

        <Menu>
          <MenuTrigger className="ml-1 grid size-9 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-ink" aria-label={t("account")}>
            {initials(user.name)}
          </MenuTrigger>
          <MenuContent className="w-64">
            <MenuLabel>
              <span className="block font-medium text-ink">{user.name}</span>
              <span className="block truncate">{user.email}</span>
              <span className="mt-1 block text-[11px] font-semibold tracking-wide text-accent-text uppercase">{t(`roles.${user.role}`)}</span>
            </MenuLabel>
            <MenuSeparator />
            <MenuItem asChild>
              <Link href="/admin/cuenta">
                <UserCircleIcon size={16} />
                {t("myAccount")}
              </Link>
            </MenuItem>
            <div className="px-2.5 py-2">
              <ThemeToggle />
            </div>
            <MenuSeparator />
            <MenuItem destructive onSelect={() => startTransition(() => logoutAction())}>
              <SignOutIcon size={16} />
              {t("logout")}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </header>
  );
}
