"use client";

import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { saveSettingsAction } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import type { SettingGroup } from "@/server/settings";
import { useAction } from "./use-action";

type Localized = { es: string; en: string; pt: string };
const LOCALE_TABS = [
  ["es", "Español"],
  ["en", "English"],
  ["pt", "Português"],
] as const;

export interface SimpleField {
  key: string;
  label: string;
  hint?: string;
  type?: "text" | "email" | "tel" | "number" | "url";
  wide?: boolean;
}

/** Flat groups (agency, bank, booking): one input per field. */
export function SimpleSettingsForm({ group, fields, initial }: { group: SettingGroup; fields: SimpleField[]; initial: Record<string, string | number> }) {
  const t = useTranslations("admin.settings");
  const action = useAction();
  const [values, setValues] = useState(initial);
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        action.run(() => saveSettingsAction(group, values));
      }}
      className="grid gap-5 sm:grid-cols-2"
    >
      {action.error ? <Notice tone="danger" className="sm:col-span-2">{action.error}</Notice> : null}
      {fields.map((field) => (
        <Field key={field.key} label={field.label} hint={field.hint} error={action.fieldErrors[field.key]} className={field.wide ? "sm:col-span-2" : undefined}>
          {(props) => (
            <Input
              {...props}
              type={field.type ?? "text"}
              value={values[field.key] ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, [field.key]: field.type === "number" ? Number(event.target.value) : event.target.value }))}
            />
          )}
        </Field>
      ))}
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" loading={action.pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

export function NotificationsForm({ initial }: { initial: string[] }) {
  const t = useTranslations("admin.settings");
  const action = useAction();
  const [value, setValue] = useState(initial.join(", "));
  const emails = value
    .split(/[,\s;]+/)
    .map((email) => email.trim())
    .filter(Boolean);
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        action.run(() => saveSettingsAction("notifications", { adminEmails: emails }));
      }}
      className="space-y-5"
    >
      {action.error ? <Notice tone="danger">{action.error}</Notice> : null}
      <Field label={t("notifications.emails")} hint={t("notifications.emailsHint")} error={Object.values(action.fieldErrors)[0]}>
        {(props) => <Textarea {...props} rows={3} value={value} onChange={(event) => setValue(event.target.value)} />}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" loading={action.pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

export function PoliciesForm({ initial }: { initial: { cancellation: Localized; terms: Localized } }) {
  const t = useTranslations("admin.settings");
  const action = useAction();
  const [values, setValues] = useState(initial);
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        action.run(() => saveSettingsAction("policies", values));
      }}
      className="space-y-5"
    >
      {action.error ? <Notice tone="danger">{action.error}</Notice> : null}
      <Tabs defaultValue="es">
        <TabsList>
          {LOCALE_TABS.map(([code, name]) => (
            <TabsTrigger key={code} value={code}>
              {name}
            </TabsTrigger>
          ))}
        </TabsList>
        {LOCALE_TABS.map(([code]) => (
          <TabsContent key={code} value={code} className="mt-5 space-y-5">
            <Field label={t("policies.cancellation")} hint={t("policies.hint")}>
              {(props) => (
                <Textarea {...props} rows={6} value={values.cancellation[code]} onChange={(event) => setValues({ ...values, cancellation: { ...values.cancellation, [code]: event.target.value } })} />
              )}
            </Field>
            <Field label={t("policies.terms")}>
              {(props) => <Textarea {...props} rows={10} value={values.terms[code]} onChange={(event) => setValues({ ...values, terms: { ...values.terms, [code]: event.target.value } })} />}
            </Field>
          </TabsContent>
        ))}
      </Tabs>
      <div className="flex justify-end">
        <Button type="submit" loading={action.pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

interface Testimonial {
  name: string;
  origin: string;
  quote: Localized;
}

export function HomeForm({
  site,
  destinations,
  cities,
  testimonials,
}: {
  site: { heroImageUrl: string; ctaImageUrl: string };
  destinations: { city: string; imageUrl: string }[];
  cities: string[];
  testimonials: Testimonial[];
}) {
  const t = useTranslations("admin.settings.home");
  const tc = useTranslations("admin.settings");
  const siteAction = useAction();
  const destinationsAction = useAction();
  const testimonialsAction = useAction();
  const [siteValues, setSiteValues] = useState(site);
  const [images, setImages] = useState<Record<string, string>>(Object.fromEntries(cities.map((city) => [city, destinations.find((d) => d.city === city)?.imageUrl ?? ""])));
  const [items, setItems] = useState(testimonials);

  return (
    <div className="space-y-10">
      <section className="space-y-5">
        <div>
          <h3 className="font-semibold">{t("imagesTitle")}</h3>
          <p className="mt-1 text-sm text-ink-3">{t("imagesHint")}</p>
        </div>
        {siteAction.error ? <Notice tone="danger">{siteAction.error}</Notice> : null}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("hero")} error={siteAction.fieldErrors.heroImageUrl}>
            {(props) => <Input {...props} type="url" value={siteValues.heroImageUrl} onChange={(event) => setSiteValues({ ...siteValues, heroImageUrl: event.target.value })} />}
          </Field>
          <Field label={t("cta")} error={siteAction.fieldErrors.ctaImageUrl}>
            {(props) => <Input {...props} type="url" value={siteValues.ctaImageUrl} onChange={(event) => setSiteValues({ ...siteValues, ctaImageUrl: event.target.value })} />}
          </Field>
        </div>
        <div className="flex justify-end">
          <Button loading={siteAction.pending} onClick={() => siteAction.run(() => saveSettingsAction("site", siteValues))}>
            {tc("save")}
          </Button>
        </div>
      </section>

      <section className="space-y-5 border-t border-line pt-8">
        <div>
          <h3 className="font-semibold">{t("destinationsTitle")}</h3>
          <p className="mt-1 text-sm text-ink-3">{t("destinationsHint")}</p>
        </div>
        {destinationsAction.error ? <Notice tone="danger">{destinationsAction.error}</Notice> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {cities.map((city) => (
            <Field key={city} label={city}>
              {(props) => <Input {...props} type="url" value={images[city] ?? ""} onChange={(event) => setImages({ ...images, [city]: event.target.value })} placeholder="https://" />}
            </Field>
          ))}
        </div>
        <div className="flex justify-end">
          <Button
            loading={destinationsAction.pending}
            onClick={() =>
              destinationsAction.run(() =>
                saveSettingsAction("destinations", { images: Object.entries(images).filter(([, url]) => url.trim()).map(([city, imageUrl]) => ({ city, imageUrl: imageUrl.trim() })) }),
              )
            }
          >
            {tc("save")}
          </Button>
        </div>
      </section>

      <section className="space-y-5 border-t border-line pt-8">
        <div>
          <h3 className="font-semibold">{t("testimonialsTitle")}</h3>
          <p className="mt-1 text-sm text-ink-3">{t("testimonialsHint")}</p>
        </div>
        {testimonialsAction.error ? <Notice tone="danger">{testimonialsAction.error}</Notice> : null}
        <ul className="space-y-4">
          {items.map((item, index) => (
            <li key={index} className="rounded-2xl border border-line p-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <Field label={t("name")}>
                  {(props) => <Input {...props} value={item.name} onChange={(event) => setItems(items.map((it, i) => (i === index ? { ...it, name: event.target.value } : it)))} />}
                </Field>
                <Field label={t("origin")}>
                  {(props) => <Input {...props} value={item.origin} onChange={(event) => setItems(items.map((it, i) => (i === index ? { ...it, origin: event.target.value } : it)))} />}
                </Field>
                <Button variant="danger-ghost" size="icon" onClick={() => setItems(items.filter((_, i) => i !== index))} aria-label={t("remove")}>
                  <TrashIcon size={16} />
                </Button>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                {LOCALE_TABS.map(([code, name]) => (
                  <Field key={code} label={`${t("quote")} (${name})`}>
                    {(props) => (
                      <Textarea
                        {...props}
                        rows={3}
                        value={item.quote[code]}
                        onChange={(event) => setItems(items.map((it, i) => (i === index ? { ...it, quote: { ...it.quote, [code]: event.target.value } } : it)))}
                      />
                    )}
                  </Field>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex justify-between">
          <Button variant="secondary" onClick={() => setItems([...items, { name: "", origin: "", quote: { es: "", en: "", pt: "" } }])} disabled={items.length >= 12}>
            <PlusIcon size={15} />
            {t("add")}
          </Button>
          <Button loading={testimonialsAction.pending} onClick={() => testimonialsAction.run(() => saveSettingsAction("testimonials", { items }))}>
            {tc("save")}
          </Button>
        </div>
      </section>
    </div>
  );
}
