"use client";

import { CheckIcon, GlobeSimpleIcon } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/primitives";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/i18n/config";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  return (
    <Menu>
      <MenuTrigger
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium uppercase transition-colors hover:bg-black/5 dark:hover:bg-white/10",
          className,
        )}
        aria-label={t("language")}
      >
        <GlobeSimpleIcon size={16} />
        {locale}
      </MenuTrigger>
      <MenuContent className="min-w-40">
        {LOCALES.map((code) => (
          <MenuItem key={code} asChild>
            <Link href={pathname} locale={code} hrefLang={code} className="justify-between">
              {LOCALE_NAMES[code]}
              {code === locale ? <CheckIcon size={14} className="text-accent-text" /> : null}
            </Link>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
