"use client";

import { PrinterIcon, TimerIcon } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

/** Time left to send the receipt; refreshes every 30 seconds. */
export function HoldCountdown({ deadline }: { deadline: string }) {
  const t = useTranslations("reservation.payment");
  const locale = useLocale();
  const now = useNow(30_000);

  const end = new Date(deadline);
  const formatted = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", hourCycle: locale === "en" ? "h12" : "h23", timeZone: "America/Argentina/Cordoba" }).format(end);
  const remaining = now === null ? null : end.getTime() - now;
  const hours = remaining === null ? 0 : Math.max(0, Math.floor(remaining / 3_600_000));
  const minutes = remaining === null ? 0 : Math.max(0, Math.floor((remaining % 3_600_000) / 60_000));
  const urgent = remaining !== null && remaining < 3 * 3_600_000;

  return (
    <div className={cn("flex items-start gap-3 rounded-2xl px-4 py-3.5 text-sm", urgent ? "bg-warning-bg text-warning-fg" : "bg-accent-soft text-accent-text")} role="status">
      <TimerIcon size={20} className="mt-0.5 shrink-0" />
      <p>
        {remaining !== null && remaining <= 0 ? t("holdExpired") : null}
        {remaining === null || remaining > 0 ? (
          <>
            {/* Server and browser ICU data can differ slightly in month abbreviations. */}
            <span className="font-semibold" suppressHydrationWarning>
              {t("holdUntil", { date: formatted })}
            </span>
            {remaining !== null ? <span className="block opacity-90">{t("holdRemaining", { hours, minutes })}</span> : null}
          </>
        ) : null}
      </p>
    </div>
  );
}

export function PrintButton() {
  const t = useTranslations("reservation.confirmed");
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <PrinterIcon size={18} />
      {t("print")}
    </Button>
  );
}
