"use client";

import { DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type Theme = "system" | "light" | "dark";
const OPTIONS: { value: Theme; icon: typeof SunIcon }[] = [
  { value: "system", icon: DesktopIcon },
  { value: "light", icon: SunIcon },
  { value: "dark", icon: MoonIcon },
];

const STORAGE_KEY = "rm-theme";
const CHANGE_EVENT = "rm-theme-change";

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Saves the choice and applies it to <html>; "system" hands control back to prefers-color-scheme. */
function applyTheme(next: Theme) {
  try {
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage can be unavailable (private mode); the choice still applies to this page.
  }
  const root = document.documentElement;
  if (next === "system") delete root.dataset.theme;
  else root.dataset.theme = next;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("common.theme");
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);

  return (
    <div role="radiogroup" aria-label={t("label")} className={cn("inline-flex rounded-full bg-surface-2 p-1", className)}>
      {OPTIONS.map(({ value, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={t(value)}
          title={t(value)}
          onClick={() => applyTheme(value)}
          className={cn(
            "grid size-8 place-items-center rounded-full text-ink-3 transition-colors",
            theme === value ? "bg-surface text-ink shadow-soft" : "hover:text-ink",
          )}
        >
          <Icon size={15} />
        </button>
      ))}
    </div>
  );
}
