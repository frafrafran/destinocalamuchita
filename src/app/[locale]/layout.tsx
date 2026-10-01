import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Toaster } from "@/components/ui/toaster";
import { PUBLIC_CLIENT_NAMESPACES, pickMessages } from "@/i18n/client-messages";
import { LOCALE_TAGS } from "@/i18n/config";
import { routing } from "@/i18n/routing";
import { metadataBase } from "@/server/seo";
import { getSettings } from "@/server/settings";
import "../globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

// Every page reads live data (settings, availability, prices), so nothing is prerendered at build time.
export const dynamic = "force-dynamic";

// Only real locales reach the pages: "/favicon.ico" or "/.well-known/..." answer 404 instead of rendering.
export const dynamicParams = false;
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/** Applies the saved theme before first paint (no flash). "system" removes the attribute. */
const THEME_SCRIPT = `try{var t=localStorage.getItem("rm-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0c110f" },
  ],
};

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const [t, settings] = await Promise.all([getTranslations({ locale, namespace: "meta" }), getSettings()]);
  const name = settings.agency.name;
  return {
    metadataBase,
    title: { default: t("title", { name }), template: `%s · ${name}` },
    description: t("description"),
    applicationName: name,
    openGraph: { siteName: name, type: "website", locale: LOCALE_TAGS[locale as keyof typeof LOCALE_TAGS] ?? "es-AR" },
    twitter: { card: "summary_large_image" },
    formatDetection: { telephone: false },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={LOCALE_TAGS[locale]} className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-bg text-ink antialiased">
        <NextIntlClientProvider messages={await pickMessages(PUBLIC_CLIENT_NAMESPACES)}>
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
