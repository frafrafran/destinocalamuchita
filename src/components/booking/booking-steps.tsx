import { CheckIcon } from "@phosphor-icons/react/ssr";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import type { BookingStep } from "@/lib/reservation-status";
import { cn } from "@/lib/utils";

const STEPS: BookingStep[] = ["dates", "details", "payment", "proof", "confirmation"];

/** "Where am I?" indicator shared by the checkout and the guest's reservation page. */
export function BookingSteps({ current, complete = false }: { current: BookingStep; complete?: boolean }) {
  const t = useTranslations("booking.steps");
  const currentIndex = STEPS.indexOf(current);
  return (
    <nav aria-label={t("label")}>
      <ol className="flex w-full items-center gap-2 sm:gap-3">
        {STEPS.map((step, index) => {
          const done = index < currentIndex || (complete && index === currentIndex);
          const active = index === currentIndex && !complete;
          return (
            <Fragment key={step}>
              <li className="flex shrink-0 items-center gap-2" aria-current={active ? "step" : undefined}>
                <span
                  className={cn(
                    "tabular grid size-7 place-items-center rounded-full text-xs font-semibold transition-colors",
                    done ? "bg-accent text-accent-ink" : active ? "bg-ink text-bg" : "bg-surface-3 text-ink-3",
                  )}
                >
                  {done ? <CheckIcon size={13} weight="bold" /> : index + 1}
                </span>
                <span className={cn("text-sm whitespace-nowrap", active ? "font-semibold text-ink" : done ? "text-ink-2" : "text-ink-3", !active && "max-md:sr-only")}>
                  {t(step)}
                </span>
              </li>
              {index < STEPS.length - 1 ? (
                <li aria-hidden className={cn("h-px min-w-3 flex-1", done ? "bg-accent" : "bg-line-strong")} />
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
