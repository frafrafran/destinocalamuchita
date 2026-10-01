"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { Input, Select } from "@/components/ui/field";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Keeps list filters in the URL (shareable, back-button friendly). Changing a filter resets paging. */
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in changes)) next.delete("page");
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`, { scroll: false }));
  };
  return { params, update, pending };
}

export function FilterTabs({ name, options }: { name: string; options: { value: string; label: string; count?: number }[] }) {
  const { params, update } = useUrlFilters();
  const current = params.get(name) ?? "";
  return (
    <div className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
      {options.map((option) => {
        const active = current === option.value;
        return (
          <button
            key={option.value || "all"}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => update({ [name]: option.value || null })}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors",
              active ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            {option.label}
            {option.count !== undefined ? <span className={cn("tabular text-xs", active ? "opacity-70" : "text-ink-3")}>{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function FilterSearch({ name = "q", placeholder }: { name?: string; placeholder: string }) {
  const { params, update } = useUrlFilters();
  const [value, setValue] = useState(params.get(name) ?? "");
  return (
    <form
      role="search"
      className="relative w-full sm:w-72"
      onSubmit={(event) => {
        event.preventDefault();
        update({ [name]: value.trim() || null });
      }}
    >
      <MagnifyingGlassIcon size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
      <Input value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => value.trim() !== (params.get(name) ?? "") && update({ [name]: value.trim() || null })} placeholder={placeholder} aria-label={placeholder} className="h-10 pl-10 text-sm" />
    </form>
  );
}

export function FilterSelect({ name, label, options }: { name: string; label: string; options: { value: string; label: string }[] }) {
  const { params, update } = useUrlFilters();
  return (
    <Select aria-label={label} value={params.get(name) ?? ""} onChange={(event) => update({ [name]: event.target.value || null })} className="h-10 w-auto min-w-44 text-sm">
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

export function FilterDate({ name, label }: { name: string; label: string }) {
  const { params, update } = useUrlFilters();
  return (
    <label className="flex items-center gap-2 text-sm text-ink-3">
      {label}
      <Input type="date" value={params.get(name) ?? ""} onChange={(event) => update({ [name]: event.target.value || null })} className="h-10 w-auto text-sm" />
    </label>
  );
}

export function Pagination({ page, pages, labels }: { page: number; pages: number; labels: { previous: string; next: string; summary: string } }) {
  const { update } = useUrlFilters();
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-3 text-sm">
      <p className="text-ink-3">{labels.summary}</p>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} className="h-9 rounded-full border border-line-strong px-4 font-medium disabled:opacity-40">
          {labels.previous}
        </button>
        <button type="button" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })} className="h-9 rounded-full border border-line-strong px-4 font-medium disabled:opacity-40">
          {labels.next}
        </button>
      </div>
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-5 flex flex-col gap-3">{children}</div>;
}
