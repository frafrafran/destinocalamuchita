"use client";

import { CheckIcon, CopyIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { Checkbox as RadixCheckbox, DropdownMenu, Popover as RadixPopover, Switch as RadixSwitch, Tabs as RadixTabs } from "radix-ui";
import { type ComponentProps, type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

// ─── Popover ──────────────────────────────────────────────────────────────────

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;

export function PopoverContent({ className, align = "start", sideOffset = 10, ...props }: ComponentProps<typeof RadixPopover.Content>) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={16}
        className={cn(
          "z-50 rounded-2xl border border-line bg-surface p-4 shadow-float outline-none",
          "data-[state=open]:animate-[pop-in_180ms_var(--ease-soft)]",
          className,
        )}
        {...props}
      />
    </RadixPopover.Portal>
  );
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({ className, align = "end", ...props }: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={8}
        collisionPadding={12}
        className={cn(
          "z-50 min-w-48 rounded-xl border border-line bg-surface p-1.5 shadow-float outline-none",
          "data-[state=open]:animate-[pop-in_160ms_var(--ease-soft)]",
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

export function MenuItem({ className, destructive, ...props }: ComponentProps<typeof DropdownMenu.Item> & { destructive?: boolean }) {
  return (
    <DropdownMenu.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors",
        destructive ? "text-danger-fg data-highlighted:bg-danger-bg" : "text-ink-2 data-highlighted:bg-surface-2 data-highlighted:text-ink",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-line" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1 text-xs text-ink-3">{children}</DropdownMenu.Label>;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

export const Tabs = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn("scrollbar-none inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface-2 p-1", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium text-ink-3 transition-all",
        "hover:text-ink data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-soft",
        className,
      )}
      {...props}
    />
  );
}

// ─── Switch & checkbox ────────────────────────────────────────────────────────

export function Switch({ className, ...props }: ComponentProps<typeof RadixSwitch.Root>) {
  return (
    <RadixSwitch.Root
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-line-strong transition-colors data-[state=checked]:bg-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-surface shadow-soft transition-transform duration-200 ease-(--ease-snappy) data-[state=checked]:translate-x-[18px]" />
    </RadixSwitch.Root>
  );
}

export function Checkbox({ className, ...props }: ComponentProps<typeof RadixCheckbox.Root>) {
  return (
    <RadixCheckbox.Root
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-md border border-line-strong bg-surface transition-colors",
        "data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-ink",
        "aria-invalid:border-danger-fg",
        className,
      )}
      {...props}
    >
      <RadixCheckbox.Indicator>
        <CheckIcon size={13} weight="bold" />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}

// ─── Counter (guests) ─────────────────────────────────────────────────────────

export function Counter({
  value,
  min = 1,
  max,
  onChange,
  decrementLabel,
  incrementLabel,
  id,
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
  decrementLabel: string;
  incrementLabel: string;
  id?: string;
}) {
  const stepButton =
    "grid size-9 place-items-center rounded-full border border-line-strong text-ink-2 transition-colors hover:border-ink-3 hover:text-ink disabled:opacity-30 disabled:hover:border-line-strong";
  return (
    <div className="flex items-center gap-3">
      <button type="button" className={stepButton} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={decrementLabel}>
        <MinusIcon size={14} />
      </button>
      <output id={id} aria-live="polite" className="tabular min-w-6 text-center text-base font-medium">
        {value}
      </output>
      <button type="button" className={stepButton} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={incrementLabel}>
        <PlusIcon size={14} />
      </button>
    </div>
  );
}

// ─── CopyIcon to clipboard ────────────────────────────────────────────────────────

export function CopyButton({ value, label, copiedLabel, className }: { value: string; label: string; copiedLabel: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
        copied ? "bg-success-bg text-success-fg" : "bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink",
        className,
      )}
      aria-live="polite"
    >
      {copied ? <CheckIcon size={13} weight="bold" /> : <CopyIcon size={13} />}
      {copied ? copiedLabel : label}
    </button>
  );
}
