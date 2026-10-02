import { InfoIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import { getTranslations } from "next-intl/server";
import { Notice } from "@/components/ui/feedback";
import { env } from "@/server/env";

/** Small fixed label on every page while DEMO_MODE is on. */
export async function DemoBadge() {
  if (!env.DEMO_MODE) return null;
  const t = await getTranslations("common.demo");
  return (
    <p className="pointer-events-none fixed bottom-24 left-4 z-40 inline-flex items-center gap-2 rounded-full bg-warning-bg px-3.5 py-2 text-xs font-medium text-warning-fg shadow-soft md:bottom-4 print:hidden">
      <InfoIcon size={15} weight="fill" />
      <span>
        {t("badge")}
        <span className="hidden sm:inline"> · {t("badgeHint")}</span>
      </span>
    </p>
  );
}

/** Prominent warning where a visitor could book or transfer money (booking form, payment page). */
export async function DemoWarning({ className }: { className?: string }) {
  if (!env.DEMO_MODE) return null;
  const t = await getTranslations("common.demo");
  return (
    <Notice tone="warning" icon={<WarningIcon size={18} weight="fill" />} title={t("warningTitle")} className={className}>
      {t("warningBody")}
    </Notice>
  );
}
