import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminHeader, type HeaderNotification } from "@/components/admin/admin-header";
import { AdminNav } from "@/components/admin/admin-nav";
import { ADMIN_SECTIONS, type AdminNavKey } from "@/components/admin/nav-config";
import { Logo } from "@/components/site/logo";
import { PUBLIC_CLIENT_NAMESPACES, pickMessages } from "@/i18n/client-messages";
import { Link } from "@/i18n/navigation";
import { requirePageUser } from "@/server/auth/guard";
import { can } from "@/server/auth/permissions";
import type { NotificationPayload } from "@/server/notifications/templates";
import { type NotificationTemplate, renderNotification } from "@/server/notifications/templates";
import { getNotifications, getShellCounts } from "@/server/queries/admin";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: LayoutProps<"/[locale]/admin">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: { default: t("metaTitle"), template: `%s · ${t("metaTitle")}` }, robots: { index: false, follow: false } };
}

/** Absolute links stored in notifications → in-app relative paths. */
function toPath(link: string | undefined): string {
  if (!link) return "/admin";
  try {
    const url = new URL(link, "http://localhost");
    return url.pathname.startsWith("/admin") ? url.pathname : "/admin";
  } catch {
    return "/admin";
  }
}

export default async function AdminLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requirePageUser("dashboard:view");
  const [settings, counts, notifications, messages] = await Promise.all([
    getSettings(),
    getShellCounts(user),
    getNotifications(user),
    pickMessages([...PUBLIC_CLIENT_NAMESPACES, "admin"]),
  ]);

  const allowed = ADMIN_SECTIONS.filter((section) => can(user.role, section.permission)).map((section) => section.key) as AdminNavKey[];
  const navCounts: Partial<Record<AdminNavKey, number>> = { reservations: counts.awaiting + counts.conflicts, payments: counts.proofs };
  const headerNotifications: HeaderNotification[] = notifications.map((notification) => {
    const payload = notification.payload as NotificationPayload;
    const rendered = renderNotification(notification.template as NotificationTemplate, locale, payload, settings.agency.name);
    return {
      id: notification.id,
      title: rendered.title,
      detail: [payload.code, payload.propertyTitle].filter(Boolean).join(" · "),
      href: toPath(payload.link),
      createdAt: notification.createdAt.toISOString(),
      unread: !notification.readAt,
    };
  });

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface-2/60 px-4 py-5 lg:flex">
          <Link href="/admin" className="mb-8 px-2">
            <Logo name={settings.agency.name} />
          </Link>
          <AdminNav allowed={allowed} counts={navCounts} />
          <div className="mt-auto rounded-2xl border border-line bg-surface p-4 text-xs text-ink-3">
            <p className="font-medium text-ink">{user.name}</p>
            <p className="truncate">{user.email}</p>
          </div>
        </aside>
        <div className="min-w-0">
          <AdminHeader
            agencyName={settings.agency.name}
            user={{ name: user.name, email: user.email, role: user.role }}
            notifications={headerNotifications}
            unread={counts.unread}
            allowed={allowed}
            counts={navCounts}
          />
          <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </NextIntlClientProvider>
  );
}
