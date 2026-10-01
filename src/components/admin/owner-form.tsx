"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { type OwnerInput, deleteOwnerAction, saveOwnerAction } from "@/actions/directory";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useRouter } from "@/i18n/navigation";
import { useAction } from "./use-action";

export type OwnerValues = { [K in keyof OwnerInput]-?: string };

export function OwnerForm({ id, initial, canWrite, canDelete }: { id: string | null; initial: OwnerValues; canWrite: boolean; canDelete: boolean }) {
  const t = useTranslations("admin.owners");
  const router = useRouter();
  const action = useAction();
  const remove = useAction();
  const [values, setValues] = useState(initial);
  const set = (key: keyof OwnerValues) => (event: { target: { value: string } }) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const e = action.fieldErrors;
  const field = (key: keyof OwnerValues, label: string, props: { hint?: string; type?: string; inputMode?: "numeric" | "decimal" | "email" | "tel"; required?: boolean } = {}) => (
    <Field key={key} label={label} hint={props.hint} error={e[key]} required={props.required}>
      {(fieldProps) => <Input {...fieldProps} type={props.type} inputMode={props.inputMode} value={values[key]} onChange={set(key)} disabled={!canWrite} />}
    </Field>
  );

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        action.run(() => saveOwnerAction(id, values), { onSuccess: ({ id: savedId }) => !id && router.push(`/admin/propietarios/${savedId}`) });
      }}
      className="space-y-8"
    >
      {action.error ? <Notice tone="danger">{action.error}</Notice> : null}
      <section className="grid gap-5 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">{t("personal")}</h2>
        {field("firstName", t("firstName"), { required: true })}
        {field("lastName", t("lastName"), { required: true })}
        {field("email", t("email"), { type: "email", inputMode: "email", required: true })}
        {field("phone", t("phone"), { type: "tel", inputMode: "tel" })}
        {field("taxId", t("taxId"), { hint: t("taxIdHint") })}
        {field("commissionPercent", t("commission"), { inputMode: "decimal", hint: t("commissionHint") })}
      </section>
      <section className="grid gap-5 border-t border-line pt-8 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="font-semibold">{t("bank")}</h2>
          <p className="mt-1 text-sm text-ink-3">{t("bankHint")}</p>
        </div>
        {field("bankName", t("bankName"))}
        {field("accountHolder", t("accountHolder"))}
        {field("cbu", t("cbu"), { inputMode: "numeric", hint: t("cbuHint") })}
        {field("alias", t("alias"))}
        {field("accountTaxId", t("accountTaxId"))}
      </section>
      <section className="border-t border-line pt-8">
        <Field label={t("notes")} hint={t("notesHint")}>
          {(props) => <Textarea {...props} rows={4} value={values.notes} onChange={set("notes")} disabled={!canWrite} />}
        </Field>
      </section>
      {remove.error ? <Notice tone="danger">{remove.error}</Notice> : null}
      {canWrite ? (
        <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-6">
          {id && canDelete ? (
            <Button
              variant="danger-ghost"
              disabled={remove.pending}
              onClick={() => window.confirm(t("confirmDelete")) && remove.run(() => deleteOwnerAction(id), { success: t("deleted"), onSuccess: () => router.push("/admin/propietarios") })}
            >
              {t("delete")}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" loading={action.pending}>
            {id ? t("save") : t("create")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
