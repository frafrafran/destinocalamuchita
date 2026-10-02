"use client";

import { ListIcon, XIcon } from "@phosphor-icons/react";
import { Dialog as RadixDialog } from "radix-ui";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "./locale-switcher";
import { Logo } from "./logo";

const LINKS = [
  { href: "/propiedades", key: "properties" },
  { href: "/#destinos", key: "destinations" },
  { href: "/#como-reservar", key: "howItWorks" },
  { href: "/contacto", key: "contact" },
] as const;

/**
 * Transparent over the home hero (for its whole pinned scroll), solid once the hero leaves the viewport.
 * Uses an IntersectionObserver sentinel (no scroll listeners).
 */
export function SiteHeader({ agencyName }: { agencyName: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const overlay = pathname === "/";
  const sentinel = useRef<HTMLDivElement>(null);
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  // Close the mobile menu after navigating (adjusting state during render, not in an effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!overlay || !sentinel.current) return;
    const observer = new IntersectionObserver(([entry]) => setSolid(!entry!.isIntersecting), { rootMargin: "-72px 0px 0px 0px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [overlay]);

  const transparent = overlay && !solid;

  return (
    <>
      {overlay ? <div ref={sentinel} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[calc(var(--home-hero-h)-28svh)] motion-reduce:h-[60vh]" /> : null}
      <header className={cn("fixed inset-x-0 top-0 z-40 transition-colors duration-300 print:hidden", transparent ? "text-white" : "text-ink")}>
        {/* The solid backdrop fades in through opacity alone (compositor-only). Transitioning backdrop-filter
            itself re-blurred the page behind the header on every frame and stuttered right where the
            home hero hands over to the next section. The blur is only applied while the backdrop shows. */}
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 -z-10 bg-bg/85 shadow-[0_1px_0_var(--line)] transition-opacity duration-300",
            transparent ? "opacity-0" : "opacity-100 backdrop-blur-xl",
          )}
        />
        <div className="mx-auto flex h-[68px] max-w-[1400px] items-center justify-between gap-2 px-4 sm:gap-6 sm:px-6 lg:px-10">
          <Link href="/" className="rounded-lg" aria-label={agencyName}>
            <Logo name={agencyName} inverted={transparent} />
          </Link>

          <nav aria-label={t("primary")} className="hidden items-center gap-1 lg:flex">
            {LINKS.map((link) => {
              const active = link.href === "/propiedades" && pathname.startsWith("/propiedades");
              return (
                <Link
                  key={link.key}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                    transparent ? "text-white/85 hover:bg-white/10 hover:text-white" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                    active && !transparent && "text-ink",
                  )}
                >
                  {t(link.key)}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5">
            <LocaleSwitcher className={transparent ? "text-white hover:bg-white/10" : "text-ink-2"} />
            <Link
              href="/reserva"
              // `className` goes through buttonClasses so `hidden` wins over its `inline-flex`.
              className={buttonClasses({ variant: transparent ? "inverse" : "secondary", size: "sm", className: "hidden sm:inline-flex" })}
            >
              {t("myBooking")}
            </Link>
            <RadixDialog.Root open={open} onOpenChange={setOpen}>
              <RadixDialog.Trigger
                className={cn(
                  "grid size-10 place-items-center rounded-full lg:hidden",
                  transparent ? "hover:bg-white/10" : "hover:bg-surface-2",
                )}
                aria-label={t("openMenu")}
              >
                <ListIcon size={22} />
              </RadixDialog.Trigger>
              <RadixDialog.Portal>
                <RadixDialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-[fade-in_180ms_ease-out]" />
                <RadixDialog.Content className="fixed inset-x-0 top-0 z-50 rounded-b-3xl bg-surface px-4 pt-3 pb-8 shadow-float data-[state=open]:animate-[pop-in_220ms_var(--ease-soft)]">
                  <div className="flex h-12 items-center justify-between">
                    <RadixDialog.Title asChild>
                      <span>
                        <Logo name={agencyName} />
                      </span>
                    </RadixDialog.Title>
                    <RadixDialog.Description className="sr-only">{t("menu")}</RadixDialog.Description>
                    <RadixDialog.Close className="grid size-10 place-items-center rounded-full hover:bg-surface-2" aria-label={t("closeMenu")}>
                      <XIcon size={20} />
                    </RadixDialog.Close>
                  </div>
                  <nav aria-label={t("primary")} className="mt-4 flex flex-col">
                    {LINKS.map((link) => (
                      <Link key={link.key} href={link.href} className="rounded-xl px-3 py-3.5 text-lg font-medium tracking-tight hover:bg-surface-2">
                        {t(link.key)}
                      </Link>
                    ))}
                  </nav>
                  <Link href="/reserva" className={buttonClasses({ className: "mt-6 w-full" })}>
                    {t("myBooking")}
                  </Link>
                </RadixDialog.Content>
              </RadixDialog.Portal>
            </RadixDialog.Root>
          </div>
        </div>
      </header>
    </>
  );
}
