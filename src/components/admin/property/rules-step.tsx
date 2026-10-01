"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { saveStayRulesAction, saveTranslationAction } from "@/actions/properties";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { useAction } from "../use-action";

export interface RulesValues {
  checkInTime: string;
  checkOutTime: string;
  houseRules: string;
  arrivalInstructions: string;
  cancellationPolicy: string;
}

type RulesTranslation = Pick<RulesValues, "houseRules" | "arrivalInstructions" | "cancellationPolicy">;

export function RulesStep({ propertyId, initial, translations }: { propertyId: string; initial: RulesValues; translations: Record<"en" | "pt", RulesTranslation> }) {
  const t = useTranslations("admin.property.rules");
  const action = useAction();
  const [values, setValues] = useState(initial);
  const set = (key: keyof RulesValues) => (event: { target: { value: string } }) => setValues((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="space-y-6">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          action.run(() => saveStayRulesAction(propertyId, values));
        }}
        className="space-y-5 rounded-2xl border border-line bg-surface p-6"
      >
        {action.error ? <Notice tone="danger">{action.error}</Notice> : null}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("checkIn")} error={action.fieldErrors.checkInTime}>
            {(props) => <Input {...props} type="time" value={values.checkInTime} onChange={set("checkInTime")} />}
          </Field>
          <Field label={t("checkOut")} error={action.fieldErrors.checkOutTime}>
            {(props) => <Input {...props} type="time" value={values.checkOutTime} onChange={set("checkOutTime")} />}
          </Field>
        </div>
        <Field label={t("houseRules")} hint={t("houseRulesHint")} error={action.fieldErrors.houseRules}>
          {(props) => <Textarea {...props} rows={5} value={values.houseRules} onChange={set("houseRules")} />}
        </Field>
        <Field label={t("arrival")} hint={t("arrivalHint")} error={action.fieldErrors.arrivalInstructions}>
          {(props) => <Textarea {...props} rows={5} value={values.arrivalInstructions} onChange={set("arrivalInstructions")} />}
        </Field>
        <Field label={t("cancellation")} hint={t("cancellationHint")} error={action.fieldErrors.cancellationPolicy}>
          {(props) => <Textarea {...props} rows={4} value={values.cancellationPolicy} onChange={set("cancellationPolicy")} />}
        </Field>
        <div className="flex justify-end">
          <Button type="submit" loading={action.pending}>
            {t("save")}
          </Button>
        </div>
      </form>

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
              <RulesTranslationForm propertyId={propertyId} locale={locale} initial={translations[locale]} />
            </TabsContent>
          ))}
        </Tabs>
      </section>
    </div>
  );
}

function RulesTranslationForm({ propertyId, locale, initial }: { propertyId: string; locale: "en" | "pt"; initial: RulesTranslation }) {
  const t = useTranslations("admin.property.rules");
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
      <Field label={t("houseRules")}>{(props) => <Textarea {...props} rows={4} value={values.houseRules} onChange={(event) => setValues({ ...values, houseRules: event.target.value })} />}</Field>
      <Field label={t("arrival")}>
        {(props) => <Textarea {...props} rows={4} value={values.arrivalInstructions} onChange={(event) => setValues({ ...values, arrivalInstructions: event.target.value })} />}
      </Field>
      <Field label={t("cancellation")}>
        {(props) => <Textarea {...props} rows={3} value={values.cancellationPolicy} onChange={(event) => setValues({ ...values, cancellationPolicy: event.target.value })} />}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" loading={action.pending}>
          {t("saveTranslation")}
        </Button>
      </div>
    </form>
  );
}
