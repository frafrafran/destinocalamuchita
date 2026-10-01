import { KeyIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LookupForm } from "@/components/reservation/lookup-form";
import { Notice } from "@/components/ui/feedback";
import type { Locale } from "@/i18n/config";
import { alternatesFor } from "@/server/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/reserva">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "reservation.lookup" });
  return { title: t("metaTitle"), alternates: alternatesFor(locale as Locale, "/reserva") };
}

export default async function LookupPage({ params, searchParams }: PageProps<"/[locale]/reserva">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const t = await getTranslations("reservation.lookup");
  const code = typeof query.code === "string" ? query.code.slice(0, 10) : "";

  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-4 pt-[120px] pb-24 sm:px-6 lg:grid-cols-[1fr_420px] lg:gap-20 lg:px-10">
      <div>
        <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent-text">
          <KeyIcon size={24} />
        </span>
        <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{t("title")}</h1>
        <p className="mt-3 max-w-md leading-relaxed text-ink-3">{t("subtitle")}</p>
        <ul className="mt-8 space-y-3 text-sm text-ink-2">
          <li>{t("point1")}</li>
          <li>{t("point2")}</li>
          <li>{t("point3")}</li>
        </ul>
      </div>
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-soft sm:p-8">
        {query.invalid ? (
          <Notice tone="warning" className="mb-5">
            {t("invalidLink")}
          </Notice>
        ) : null}
        <LookupForm defaultCode={code} />
      </div>
    </div>
  );
}
