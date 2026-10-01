"use client";

import { CheckIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { PROPERTY_STEPS, type PropertyStep } from "./steps";

/** Wizard navigation: every step stays reachable, completed ones are ticked. */
export function PropertySteps({ propertyId, current, done }: { propertyId: string | null; current: PropertyStep; done: Partial<Record<PropertyStep, boolean>> }) {
  const t = useTranslations("admin.property.steps");
  const nav = useRef<HTMLElement>(null);

  // On narrow screens the step bar scrolls sideways: keep the current step visible (DOM sync only).
  useEffect(() => {
    const box = nav.current;
    const item = box?.querySelector<HTMLElement>("[aria-current=step]");
    if (!box || !item) return;
    const left = item.offsetLeft - box.offsetLeft;
    if (left < box.scrollLeft || left + item.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = left - 16;
  }, [current]);

  return (
    <nav ref={nav} aria-label={t("label")} className="scrollbar-none -mx-1 overflow-x-auto px-1">
      <ol className="flex min-w-max gap-1 rounded-2xl border border-line bg-surface p-1.5">
        {PROPERTY_STEPS.map((step, index) => {
          const active = step === current;
          const disabled = !propertyId && step !== "info";
          const content = (
            <>
              <span
                className={cn(
                  "tabular grid size-6 place-items-center rounded-full text-[11px] font-semibold",
                  active ? "bg-accent text-accent-ink" : done[step] ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-ink-3",
                )}
              >
                {done[step] && !active ? <CheckIcon size={12} weight="bold" /> : index + 1}
              </span>
              {t(step)}
            </>
          );
          const classes = cn(
            "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
            active ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink",
            disabled && "pointer-events-none opacity-40",
          );
          return (
            <li key={step}>
              {disabled || !propertyId ? (
                <span className={classes} aria-current={active ? "step" : undefined}>
                  {content}
                </span>
              ) : (
                <Link href={`/admin/propiedades/${propertyId}?paso=${step}`} className={classes} aria-current={active ? "step" : undefined} scroll={false}>
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
