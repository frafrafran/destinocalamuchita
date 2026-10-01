"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toDbDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { Quote } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/** Itemised total: nights, discount, fees, cleaning. Each night is inspectable. */
export function PriceBreakdown({ quote, className }: { quote: Quote; className?: string }) {
  const t = useTranslations("booking.breakdown");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const money = (cents: number) => formatMoney(cents, quote.currency, locale);
  const day = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const uniform = quote.nightly.every((night) => night.price === quote.nightly[0]!.price);

  return (
    <div className={cn("text-sm", className)}>
      <dl className="space-y-2.5">
        <div className="flex items-start justify-between gap-4">
          <dt>
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-1 text-left text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
              {uniform
                ? t("nightsUniform", { price: money(quote.nightly[0]!.price), count: quote.nights })
                : t("nightsVariable", { count: quote.nights })}
              <CaretDownIcon size={12} className={cn("transition-transform", open && "rotate-180")} />
            </button>
          </dt>
          <dd className="tabular text-ink">{money(quote.nightlySubtotal)}</dd>
        </div>
        {open ? (
          <ul className="ml-1 space-y-1.5 border-l border-line pl-3 text-xs text-ink-3">
            {quote.nightly.map((night) => (
              <li key={night.date} className="flex justify-between gap-4">
                <span className="inline-block first-letter:uppercase">
                  {day.format(toDbDate(night.date))}
                  {night.label ? ` · ${night.label}` : night.kind === "WEEKEND" ? ` · ${t("weekend")}` : ""}
                </span>
                <span className="tabular">{money(night.price)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {quote.discount ? (
          <div className="flex justify-between gap-4 text-success-fg">
            <dt>{t("discount", { name: quote.discount.name, percent: quote.discount.percent })}</dt>
            <dd className="tabular">-{money(quote.discount.amount)}</dd>
          </div>
        ) : null}
        {quote.cleaningFee > 0 ? (
          <div className="flex justify-between gap-4">
            <dt className="text-ink-2">{t("cleaning")}</dt>
            <dd className="tabular">{money(quote.cleaningFee)}</dd>
          </div>
        ) : null}
        {quote.fees.map((fee) => (
          <div key={fee.name} className="flex justify-between gap-4">
            <dt className="text-ink-2">{fee.name}</dt>
            <dd className="tabular">{money(fee.amount)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-line pt-4">
        <p className="font-semibold">{t("total")}</p>
        <p className="tabular text-lg font-semibold">{money(quote.total)}</p>
      </div>
    </div>
  );
}
