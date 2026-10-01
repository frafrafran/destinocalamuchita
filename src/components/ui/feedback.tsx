import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-xl", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center", className)}>
      {icon ? <div className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent-text">{icon}</div> : null}
      <div className="max-w-sm">
        <p className="font-semibold text-ink">{title}</p>
        {description ? <p className="mt-1 text-sm leading-relaxed text-ink-3">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Notice({
  tone = "info",
  icon,
  title,
  children,
  className,
}: {
  tone?: "info" | "warning" | "success" | "danger" | "neutral";
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "bg-info-bg text-info-fg",
    warning: "bg-warning-bg text-warning-fg",
    success: "bg-success-bg text-success-fg",
    danger: "bg-danger-bg text-danger-fg",
    neutral: "bg-surface-2 text-ink-2",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-2xl px-4 py-3.5 text-sm leading-relaxed", tones[tone], className)}>
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title ? "mt-0.5 opacity-90" : undefined)}>{children}</div> : null}
      </div>
    </div>
  );
}
