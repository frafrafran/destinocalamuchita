import type { ReactNode } from "react";
import type { StatusTone } from "@/lib/reservation-status";
import { cn } from "@/lib/utils";

const TONES: Record<StatusTone | "accent", string> = {
  neutral: "bg-neutral-bg text-neutral-fg",
  info: "bg-info-bg text-info-fg",
  warning: "bg-warning-bg text-warning-fg",
  progress: "bg-progress-bg text-progress-fg",
  success: "bg-success-bg text-success-fg",
  danger: "bg-danger-bg text-danger-fg",
  muted: "bg-muted-bg text-muted-fg",
  accent: "bg-accent-soft text-accent-text",
};

export function Badge({
  tone = "neutral",
  icon,
  className,
  children,
}: {
  tone?: StatusTone | "accent";
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium leading-5",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
