import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HomeForm, NotificationsForm, PoliciesForm, SimpleSettingsForm } from "@/components/admin/settings-forms";
import { PageHeader, Panel, Table, Td, Th, Tr } from "@/components/admin/ui";
import { UsersPanel } from "@/components/admin/users-panel";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { loadSettings } from "@/server/settings";

const TABS = ["agencia", "reservas", "banco", "notificaciones", "politicas", "portada", "usuarios", "auditoria"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/configuracion">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.nav" });
  return { title: t("settings") };
}

export default async function SettingsPage({ params, searchParams }: PageProps<"/[locale]/admin/configuracion">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const user = await requirePageUser("settings:manage");
  const query = await searchParams;
  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : "agencia";
  const [t, settings] = await Promise.all([getTranslations("admin.settings"), loadSettings()]);
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", hourCycle: locale === "en" ? "h12" : "h23", timeZone: "America/Argentina/Cordoba" });

  let body: React.ReactNode = null;
  if (tab === "agencia") {
    body = (
      <SimpleSettingsForm
        group="agency"
        initial={settings.agency}
        fields={[
          { key: "name", label: t("agency.name"), hint: t("agency.nameHint") },
          { key: "legalName", label: t("agency.legalName") },
          { key: "taxId", label: t("agency.taxId") },
          { key: "email", label: t("agency.email"), type: "email" },
          { key: "phone", label: t("agency.phone"), type: "tel" },
          { key: "whatsapp", label: t("agency.whatsapp"), type: "tel", hint: t("agency.whatsappHint") },
          { key: "address", label: t("agency.address") },
          { key: "city", label: t("agency.city") },
          { key: "instagram", label: t("agency.instagram") },
        ]}
      />
    );
  } else if (tab === "reservas") {
    body = (
      <SimpleSettingsForm
        group="booking"
        initial={settings.booking}
        fields={[
          { key: "holdHours", label: t("booking.holdHours"), hint: t("booking.holdHoursHint"), type: "number" },
          { key: "reminderDaysBefore", label: t("booking.reminder"), hint: t("booking.reminderHint"), type: "number" },
        ]}
      />
    );
  } else if (tab === "banco") {
    body = (
      <>
        <p className="mb-5 text-sm text-ink-3">{t("bank.hint")}</p>
        <SimpleSettingsForm
          group="bank"
          initial={settings.bank}
          fields={[
            { key: "bankName", label: t("bank.bankName") },
            { key: "accountHolder", label: t("bank.accountHolder") },
            { key: "cbu", label: t("bank.cbu") },
            { key: "alias", label: t("bank.alias") },
            { key: "accountTaxId", label: t("bank.accountTaxId") },
          ]}
        />
      </>
    );
  } else if (tab === "notificaciones") {
    body = (
      <>
        <p className="mb-5 text-sm text-ink-3">{t("notifications.hint", { driver: env.EMAIL_DRIVER })}</p>
        <NotificationsForm initial={settings.notifications.adminEmails} />
      </>
    );
  } else if (tab === "politicas") {
    body = <PoliciesForm initial={settings.policies} />;
  } else if (tab === "portada") {
    const cities = await prisma.property.findMany({ where: { status: "PUBLISHED" }, distinct: ["city"], select: { city: true }, orderBy: { city: "asc" } });
    body = <HomeForm site={settings.site} destinations={settings.destinations.images} cities={cities.map((c) => c.city)} testimonials={settings.testimonials.items} />;
  } else if (tab === "usuarios") {
    const [users, owners] = await Promise.all([
      prisma.user.findMany({ where: { role: { not: "GUEST" } }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
      prisma.owner.findMany({ orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    body = (
      <UsersPanel
        currentUserId={user.id}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role as "ADMIN" | "MANAGER" | "OWNER",
          ownerId: u.ownerId,
          isActive: u.isActive,
          lastLogin: u.lastLoginAt ? dateTime.format(u.lastLoginAt) : null,
        }))}
        owners={owners.map((o) => ({ id: o.id, name: `${o.firstName} ${o.lastName}` }))}
      />
    );
  } else {
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 150, include: { actor: { select: { name: true } } } });
    body = (
      <Table>
        <thead>
          <tr>
            <Th>{t("audit.when")}</Th>
            <Th>{t("audit.who")}</Th>
            <Th>{t("audit.action")}</Th>
            <Th>{t("audit.entity")}</Th>
            <Th>{t("audit.ip")}</Th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <Tr key={log.id}>
              <Td className="whitespace-nowrap text-ink-2">{dateTime.format(log.createdAt)}</Td>
              <Td>{log.actor?.name ?? t(`audit.actor.${log.actorType}`)}</Td>
              <Td className="font-mono text-xs">{log.action}</Td>
              <Td className="text-xs text-ink-3">
                {log.entityType === "Reservation" && log.entityId ? (
                  <Link href={`/admin/reservas/${log.entityId}`} className="text-accent-text hover:underline">
                    {log.entityType}
                  </Link>
                ) : (
                  log.entityType
                )}
              </Td>
              <Td className="font-mono text-xs text-ink-3">{log.ip ?? "-"}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    );
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label={t("title")} className="flex gap-1 overflow-x-auto lg:flex-col">
          {TABS.map((key) => (
            <Link
              key={key}
              href={`/admin/configuracion?tab=${key}`}
              aria-current={tab === key ? "page" : undefined}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                tab === key ? "bg-surface text-ink shadow-soft" : "text-ink-3 hover:bg-surface/60 hover:text-ink",
              )}
            >
              {t(`tabs.${key}`)}
            </Link>
          ))}
        </nav>
        <Panel title={t(`tabs.${tab}`)} padded={tab !== "auditoria"}>
          {body}
        </Panel>
      </div>
    </>
  );
}
