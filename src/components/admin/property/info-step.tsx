"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { createPropertyAction, saveTranslationAction, updatePropertyInfoAction } from "@/actions/properties";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { useRouter } from "@/i18n/navigation";
import { useAction } from "../use-action";

/** Form state: numbers are kept as typed text and coerced (and validated) on the server. */
export interface InfoValues {
  title: string;
  slug: string;
  type: "HOUSE" | "APARTMENT" | "CABIN" | "VILLA" | "LOFT";
  summary: string;
  description: string;
  city: string;
  region: string;
  address: string;
  postalCode: string;
  latitude: string;
  longitude: string;
  maxGuests: string;
  bedrooms: string;
  beds: string;
  bathrooms: string;
  areaM2: string;
  ownerId: string;
  videoUrl: string;
  featured: boolean;
  ratingAverage: string;
  ratingCount: string;
}
export type TranslationValues = { title: string; summary: string; description: string };

interface Props {
  propertyId: string | null;
  initial: InfoValues;
  owners: { id: string; firstName: string; lastName: string }[];
  translations: Record<"en" | "pt", TranslationValues>;
  canEditOwner: boolean;
}

export function InfoStep({ propertyId, initial, owners, translations, canEditOwner }: Props) {
  const t = useTranslations("admin.property.info");
  const tTypes = useTranslations("propertyTypes");
  const router = useRouter();
  const action = useAction();
  const [values, setValues] = useState<InfoValues>(initial);
  const set = (key: Exclude<keyof InfoValues, "featured">) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));
  const e = action.fieldErrors;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (propertyId) {
      action.run(() => updatePropertyInfoAction(propertyId, values));
    } else {
      action.run(() => createPropertyAction(values), { onSuccess: ({ id }) => router.push(`/admin/propiedades/${id}?paso=fotos`) });
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} noValidate className="space-y-8 rounded-2xl border border-line bg-surface p-6">
        {action.error ? <Notice tone="danger">{action.error}</Notice> : null}

        <section className="grid gap-5 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">{t("general")}</h2>
          <Field label={t("title")} required error={e.title} className="sm:col-span-2">
            {(props) => <Input {...props} value={values.title} onChange={set("title")} maxLength={120} />}
          </Field>
          <Field label={t("type")} required>
            {(props) => (
              <Select {...props} value={values.type} onChange={set("type")}>
                {(["HOUSE", "APARTMENT", "CABIN", "VILLA", "LOFT"] as const).map((type) => (
                  <option key={type} value={type}>
                    {tTypes(type)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("slug")} hint={t("slugHint")} error={e.slug}>
            {(props) => <Input {...props} value={values.slug} onChange={set("slug")} maxLength={90} placeholder={t("slugPlaceholder")} />}
          </Field>
          <Field label={t("summary")} hint={t("summaryHint")} error={e.summary} className="sm:col-span-2">
            {(props) => <Input {...props} value={values.summary} onChange={set("summary")} maxLength={240} />}
          </Field>
          <Field label={t("description")} hint={t("descriptionHint")} error={e.description} className="sm:col-span-2">
            {(props) => <Textarea {...props} value={values.description} onChange={set("description")} rows={8} maxLength={8000} />}
          </Field>
        </section>

        <section className="grid gap-5 border-t border-line pt-8 sm:grid-cols-4">
          <h2 className="font-semibold sm:col-span-4">{t("capacity")}</h2>
          <Field label={t("maxGuests")} required error={e.maxGuests}>
            {(props) => <Input {...props} type="number" min={1} value={values.maxGuests} onChange={set("maxGuests")} />}
          </Field>
          <Field label={t("bedrooms")} required error={e.bedrooms}>
            {(props) => <Input {...props} type="number" min={0} value={values.bedrooms} onChange={set("bedrooms")} />}
          </Field>
          <Field label={t("beds")} required error={e.beds}>
            {(props) => <Input {...props} type="number" min={0} value={values.beds} onChange={set("beds")} />}
          </Field>
          <Field label={t("bathrooms")} required error={e.bathrooms} hint={t("bathroomsHint")}>
            {(props) => <Input {...props} type="number" min={0} step={0.5} value={values.bathrooms} onChange={set("bathrooms")} />}
          </Field>
          <Field label={t("area")} error={e.areaM2}>
            {(props) => <Input {...props} type="number" min={1} value={values.areaM2} onChange={set("areaM2")} />}
          </Field>
        </section>

        <section className="grid gap-5 border-t border-line pt-8 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">{t("location")}</h2>
          <Field label={t("city")} required error={e.city}>
            {(props) => <Input {...props} value={values.city} onChange={set("city")} />}
          </Field>
          <Field label={t("region")} required error={e.region}>
            {(props) => <Input {...props} value={values.region} onChange={set("region")} />}
          </Field>
          <Field label={t("address")} hint={t("addressHint")} error={e.address}>
            {(props) => <Input {...props} value={values.address} onChange={set("address")} />}
          </Field>
          <Field label={t("postalCode")} error={e.postalCode}>
            {(props) => <Input {...props} value={values.postalCode} onChange={set("postalCode")} />}
          </Field>
          <Field label={t("latitude")} hint={t("coordinatesHint")} error={e.latitude}>
            {(props) => <Input {...props} inputMode="decimal" value={values.latitude} onChange={set("latitude")} placeholder="-31.9712" />}
          </Field>
          <Field label={t("longitude")} error={e.longitude}>
            {(props) => <Input {...props} inputMode="decimal" value={values.longitude} onChange={set("longitude")} placeholder="-64.5486" />}
          </Field>
        </section>

        <section className="grid gap-5 border-t border-line pt-8 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">{t("extra")}</h2>
          {canEditOwner ? (
            <Field label={t("owner")} hint={t("ownerHint")}>
              {(props) => (
                <Select {...props} value={values.ownerId} onChange={set("ownerId")}>
                  <option value="">{t("noOwner")}</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.firstName} {owner.lastName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
          <Field label={t("video")} hint={t("videoHint")} error={e.videoUrl}>
            {(props) => <Input {...props} type="url" value={values.videoUrl} onChange={set("videoUrl")} placeholder="https://www.youtube.com/watch?v=..." />}
          </Field>
          <Field label={t("ratingAverage")} hint={t("ratingAverageHint")} error={e.ratingAverage}>
            {(props) => <Input {...props} inputMode="decimal" value={values.ratingAverage} onChange={set("ratingAverage")} placeholder="4.9" />}
          </Field>
          <Field label={t("ratingCount")} hint={t("ratingCountHint")} error={e.ratingCount}>
            {(props) => <Input {...props} inputMode="numeric" value={values.ratingCount} onChange={set("ratingCount")} />}
          </Field>
          <label className="flex items-center gap-3 text-sm sm:col-span-2">
            <Switch checked={values.featured} onCheckedChange={(featured) => setValues((current) => ({ ...current, featured }))} />
            {t("featured")}
          </label>
        </section>

        <div className="flex justify-end border-t border-line pt-6">
          <Button type="submit" loading={action.pending}>
            {propertyId ? t("save") : t("create")}
          </Button>
        </div>
      </form>

      {propertyId ? <TranslationsPanel propertyId={propertyId} translations={translations} /> : null}
    </div>
  );
}

function TranslationsPanel({ propertyId, translations }: { propertyId: string; translations: Record<"en" | "pt", TranslationValues> }) {
  const t = useTranslations("admin.property.info");
  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="font-semibold">{t("translations")}</h2>
      <p className="mt-1 text-sm text-ink-3">{t("translationsHint")}</p>
      <Tabs defaultValue="en" className="mt-5">
        <TabsList>
          <TabsTrigger value="en">English</TabsTrigger>
          <TabsTrigger value="pt">Português</TabsTrigger>
        </TabsList>
        {(["en", "pt"] as const).map((locale) => (
          <TabsContent key={locale} value={locale} className="mt-5">
            <TranslationForm propertyId={propertyId} locale={locale} initial={translations[locale]} />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function TranslationForm({ propertyId, locale, initial }: { propertyId: string; locale: "en" | "pt"; initial: TranslationValues }) {
  const t = useTranslations("admin.property.info");
  const action = useAction();
  const [values, setValues] = useState(initial);
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        action.run(() => saveTranslationAction(propertyId, { locale, ...values }));
      }}
    >
      {action.error ? <Notice tone="danger">{action.error}</Notice> : null}
      <Field label={t("title")}>{(props) => <Input {...props} value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} />}</Field>
      <Field label={t("summary")}>{(props) => <Input {...props} value={values.summary} onChange={(event) => setValues({ ...values, summary: event.target.value })} />}</Field>
      <Field label={t("description")}>
        {(props) => <Textarea {...props} rows={6} value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} />}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" loading={action.pending}>
          {t("saveTranslation")}
        </Button>
      </div>
    </form>
  );
}
