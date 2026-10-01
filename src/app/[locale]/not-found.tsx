import { CompassIcon } from "@phosphor-icons/react/ssr";
import { getTranslations } from "next-intl/server";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-6 px-6">
      <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent-text">
        <CompassIcon size={28} />
      </span>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-2 max-w-[48ch] leading-relaxed text-ink-3">{t("description")}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className={buttonClasses()}>
          {t("home")}
        </Link>
        <Link href="/propiedades" className={buttonClasses({ variant: "secondary" })}>
          {t("properties")}
        </Link>
      </div>
    </main>
  );
}
