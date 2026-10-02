import type { Metadata } from "next";
import Image from "next/image";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/components/admin/login-form";
import { Logo } from "@/components/site/logo";
import { PUBLIC_CLIENT_NAMESPACES, pickMessages } from "@/i18n/client-messages";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { getSettings } from "@/server/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/login">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.login" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await getCurrentUser()) return redirect({ href: "/admin", locale });
  const [t, settings, query] = await Promise.all([getTranslations("admin.login"), getSettings(), searchParams]);
  const next = typeof query.next === "string" ? query.next : undefined;
  const image = settings.site.ctaImageUrl || settings.site.heroImageUrl;

  return (
    <NextIntlClientProvider messages={await pickMessages([...PUBLIC_CLIENT_NAMESPACES, "admin"])}>
      <main className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col px-6 py-8 sm:px-12">
          <Link href="/" className="self-start">
            <Logo name={settings.agency.name} />
          </Link>
          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16">
            <h1 className="text-3xl font-semibold tracking-[-0.03em]">{t("title")}</h1>
            <p className="mt-2 mb-8 text-ink-3">{t("subtitle")}</p>
            <LoginForm next={next} />
          </div>
        </div>
        <div className="relative hidden bg-[#1c2420] lg:block">
          {/* A full-height column: the cropped 3:2 photo is 1.5x as wide as the screen is tall. Hidden below
              lg, where the tiny size keeps phones from preloading a photo they never show. */}
          {image ? <Image src={image} alt="" fill sizes="(min-width: 1024px) 150vh, 1px" className="object-cover" preload /> : null}
        </div>
      </main>
    </NextIntlClientProvider>
  );
}
