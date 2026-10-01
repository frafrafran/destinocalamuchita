"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { saveGuestAction } from "@/actions/directory";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useAction } from "./use-action";

interface GuestValues {
  firstName: string;
  lastName: string;
  phone: string;
  country: string;
  notes: string;
}

export function GuestForm({ id, initial, canWrite }: { id: string; initial: GuestValues; canWrite: boolean }) {
  const t = useTranslations("admin.guests");
  const action = useAction();
  const [values, setValues] = useState(initial);
  const set = (key: keyof GuestValues) => (event: { target: { value: string } }) => setValues((current) => ({ ...current, [key]: event.target.value }));
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        action.run(() => saveGuestAction(id, values));
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      {action.error ? <Notice tone="danger" className="sm:col-span-2">{action.error}</Notice> : null}
      <Field label={t("firstName")} error={action.fieldErrors.firstName}>{(props) => <Input {...props} value={values.firstName} onChange={set("firstName")} disabled={!canWrite} />}</Field>
      <Field label={t("lastName")} error={action.fieldErrors.lastName}>{(props) => <Input {...props} value={values.lastName} onChange={set("lastName")} disabled={!canWrite} />}</Field>
      <Field label={t("phone")} error={action.fieldErrors.phone}>{(props) => <Input {...props} value={values.phone} onChange={set("phone")} disabled={!canWrite} />}</Field>
      <Field label={t("country")} error={action.fieldErrors.country}>{(props) => <Input {...props} value={values.country} onChange={set("country")} disabled={!canWrite} />}</Field>
      <Field label={t("notes")} hint={t("notesHint")} className="sm:col-span-2">
        {(props) => <Textarea {...props} rows={4} value={values.notes} onChange={set("notes")} disabled={!canWrite} />}
      </Field>
      {canWrite ? (
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" loading={action.pending}>
            {t("save")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
