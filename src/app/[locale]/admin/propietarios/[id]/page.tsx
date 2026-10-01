import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OwnerForm, type OwnerValues } from "@/components/admin/owner-form";
import { PageHeader, Panel } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { requirePageUser } from "@/server/auth/guard";
import { can } from "@/server/auth/permissions";
import { getOwner } from "@/server/queries/directory";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/propietarios/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.nav" });
  return { title: t("owners") };
}

const EMPTY: OwnerValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  taxId: "",
  bankName: "",
  accountHolder: "",
  cbu: "",
  alias: "",
  accountTaxId: "",
  commissionPercent: "0",
  notes: "",
};

export default async function OwnerPage({ params }: PageProps<"/[locale]/admin/propietarios/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requirePageUser("owners:read");
  const isNew = id === "nuevo";
  const [t, tStatus, owner] = await Promise.all([getTranslations("admin.owners"), getTranslations("status.property"), isNew ? null : getOwner(id)]);
  if (!isNew && !owner) notFound();

  const initial: OwnerValues = owner
    ? {
        firstName: owner.firstName,
        lastName: owner.lastName,
        email: owner.email,
        phone: owner.phone ?? "",
        taxId: owner.taxId ?? "",
        bankName: owner.bankName ?? "",
        accountHolder: owner.accountHolder ?? "",
        cbu: owner.cbu ?? "",
        alias: owner.alias ?? "",
        accountTaxId: owner.accountTaxId ?? "",
        commissionPercent: String(Number(owner.commissionPercent)),
        notes: owner.notes ?? "",
      }
    : EMPTY;

  return (
    <>
      <PageHeader
        back={
          <Link href="/admin/propietarios" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
            <ArrowLeftIcon size={14} />
            {t("back")}
          </Link>
        }
        title={owner ? `${owner.firstName} ${owner.lastName}` : t("new")}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel>
          <OwnerForm id={owner?.id ?? null} initial={initial} canWrite={can(user.role, "owners:write")} canDelete={can(user.role, "owners:write") && (owner?.properties.length ?? 0) === 0} />
        </Panel>
        {owner ? (
          <Panel title={t("propertiesTitle")}>
            {owner.properties.length ? (
              <ul className="divide-y divide-line text-sm">
                {owner.properties.map((property) => (
                  <li key={property.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link href={`/admin/propiedades/${property.id}`} className="font-medium text-accent-text hover:underline">
                      {property.title}
                    </Link>
                    <Badge tone={property.status === "PUBLISHED" ? "success" : "neutral"}>{tStatus(property.status)}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">{t("noProperties")}</p>
            )}
            <p className="mt-4 text-xs text-ink-3">{t("assignHint")}</p>
          </Panel>
        ) : null}
      </div>
    </>
  );
}
