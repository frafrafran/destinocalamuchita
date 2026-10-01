import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ManualReservationForm } from "@/components/admin/manual-reservation-form";
import { PageHeader } from "@/components/admin/ui";
import { Link } from "@/i18n/navigation";
import { todayISO } from "@/lib/dates";
import { requirePageUser } from "@/server/auth/guard";
import { listPropertyOptions } from "@/server/queries/reservations";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/reservas/nueva">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.manual" });
  return { title: t("title") };
}

export default async function NewReservationPage({ params }: PageProps<"/[locale]/admin/reservas/nueva">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requirePageUser("reservations:write");
  const [t, properties] = await Promise.all([getTranslations("admin.manual"), listPropertyOptions(user)]);
  return (
    <>
      <PageHeader
        back={
          <Link href="/admin/reservas" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
            <ArrowLeftIcon size={14} />
            {t("back")}
          </Link>
        }
        title={t("title")}
        description={t("subtitle")}
      />
      <ManualReservationForm properties={properties.map(({ id, title, maxGuests }) => ({ id, title, maxGuests }))} today={todayISO()} />
    </>
  );
}
