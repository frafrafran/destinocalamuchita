import { CheckCircleIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader, Panel, Table, Td, Th, Tr } from "@/components/admin/ui";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Link } from "@/i18n/navigation";
import { requirePageUser } from "@/server/auth/guard";
import { can } from "@/server/auth/permissions";
import { listOwners } from "@/server/queries/directory";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/propietarios">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.nav" });
  return { title: t("owners") };
}

export default async function OwnersPage({ params }: PageProps<"/[locale]/admin/propietarios">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requirePageUser("owners:read");
  const [t, owners] = await Promise.all([getTranslations("admin.owners"), listOwners()]);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          can(user.role, "owners:write") ? (
            <Link href="/admin/propietarios/nuevo" className={buttonClasses()}>
              <PlusIcon size={16} weight="bold" />
              {t("new")}
            </Link>
          ) : null
        }
      />
      <Panel padded={false}>
        {owners.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t("table.name")}</Th>
                <Th>{t("table.contact")}</Th>
                <Th>{t("table.properties")}</Th>
                <Th>{t("table.bank")}</Th>
                <Th className="text-right">{t("table.commission")}</Th>
              </tr>
            </thead>
            <tbody>
              {owners.map((owner) => (
                <Tr key={owner.id}>
                  <Td>
                    <Link href={`/admin/propietarios/${owner.id}`} className="font-medium text-accent-text hover:underline">
                      {owner.firstName} {owner.lastName}
                    </Link>
                    {owner.user ? <p className="text-xs text-ink-3">{t("hasLogin")}</p> : null}
                  </Td>
                  <Td>
                    <p>{owner.email}</p>
                    <p className="text-xs text-ink-3">{owner.phone ?? ""}</p>
                  </Td>
                  <Td className="text-ink-2">{owner.properties.map((p) => p.title).join(", ") || "-"}</Td>
                  <Td>
                    {owner.cbu || owner.alias ? (
                      <span className="inline-flex items-center gap-1.5 text-success-fg">
                        <CheckCircleIcon size={16} weight="fill" />
                        {owner.alias ?? t("cbuOnly")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-warning-fg">
                        <WarningCircleIcon size={16} weight="fill" />
                        {t("noBank")}
                      </span>
                    )}
                  </Td>
                  <Td className="tabular text-right">{Number(owner.commissionPercent)}%</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-6">
            <EmptyState title={t("empty")} description={t("emptyHint")} />
          </div>
        )}
      </Panel>
    </>
  );
}
