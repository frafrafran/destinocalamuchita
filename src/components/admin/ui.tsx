import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Title row of every admin page. */
export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back ? <div className="mb-3">{back}</div> : null}
        <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-ink-3">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({ title, description, actions, children, className, padded = true }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cn("rounded-2xl border border-line bg-surface shadow-hairline", className)}>
      {title ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-semibold tracking-tight">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-ink-3">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      <div className={cn(padded && "p-5")}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, icon, tone = "neutral" }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "neutral" | "accent" | "warning" }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-hairline">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-3">{label}</p>
        {icon ? (
          <span
            className={cn(
              "grid size-8 place-items-center rounded-lg",
              tone === "accent" ? "bg-accent-soft text-accent-text" : tone === "warning" ? "bg-warning-bg text-warning-fg" : "bg-surface-2 text-ink-2",
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="tabular mt-3 text-[26px] leading-none font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-2 text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full min-w-[640px] border-collapse text-left text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return <th scope="col" className={cn("border-b border-line px-4 py-2.5 text-xs font-medium whitespace-nowrap text-ink-3", className)} {...props} />;
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-line px-4 py-3 align-middle", className)} {...props} />;
}

export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("transition-colors last:[&>td]:border-0 hover:bg-surface-2/60", className)} {...props} />;
}

export function DefinitionList({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line text-sm", className)}>
      {items.map((item, index) => (
        <div key={index} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-2.5">
          <dt className="text-ink-3">{item.label}</dt>
          <dd className="text-right font-medium text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
