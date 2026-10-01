"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      duration={4000}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[min(380px,calc(100vw-2rem))] items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 font-sans text-sm text-ink shadow-float",
          title: "font-medium",
          description: "mt-0.5 text-ink-3",
          icon: "mt-0.5",
          success: "[&_[data-icon]]:text-success-fg",
          error: "[&_[data-icon]]:text-danger-fg",
          actionButton: "ml-auto rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-ink",
        },
      }}
    />
  );
}
