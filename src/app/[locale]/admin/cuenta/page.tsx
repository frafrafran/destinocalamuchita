import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PasswordForm } from "@/components/admin/password-form";
import { DefinitionList, PageHeader, Panel } from "@/components/admin/ui";
import { requirePageUser } from "@/server/auth/guard";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/cuenta">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.account" });
  return { title: t("title") };
}

export default async function AccountPage({ params }: PageProps<"/[locale]/admin/cuenta">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requirePageUser();
  const [t, tRoles] = await Promise.all([getTranslations("admin.account"), getTranslations("admin.header.roles")]);
  return (
    <>
      <PageHeader title={t("title")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("profile")}>
          <DefinitionList
            items={[
              { label: t("name"), value: user.name },
              { label: t("email"), value: user.email },
              { label: t("role"), value: tRoles(user.role) },
            ]}
          />
        </Panel>
        <Panel title={t("password")} description={t("passwordHint")}>
          <PasswordForm />
        </Panel>
      </div>
    </>
  );
}
