"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { changeOwnPasswordAction } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { useAction } from "./use-action";

export function PasswordForm() {
  const t = useTranslations("admin.account");
  const action = useAction();
  const [values, setValues] = useState({ current: "", next: "", confirm: "" });
  const set = (key: keyof typeof values) => (event: { target: { value: string } }) => setValues((current) => ({ ...current, [key]: event.target.value }));
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        action.run(() => changeOwnPasswordAction(values), { success: t("changed"), onSuccess: () => setValues({ current: "", next: "", confirm: "" }) });
      }}
      className="grid max-w-md gap-4"
    >
      {action.error ? <Notice tone="danger">{action.error}</Notice> : null}
      <Field label={t("current")} error={action.fieldErrors.current}>
        {(props) => <Input {...props} type="password" autoComplete="current-password" value={values.current} onChange={set("current")} />}
      </Field>
      <Field label={t("next")} hint={t("nextHint")} error={action.fieldErrors.next}>
        {(props) => <Input {...props} type="password" autoComplete="new-password" value={values.next} onChange={set("next")} />}
      </Field>
      <Field label={t("confirm")} error={action.fieldErrors.confirm}>
        {(props) => <Input {...props} type="password" autoComplete="new-password" value={values.confirm} onChange={set("confirm")} />}
      </Field>
      <div>
        <Button type="submit" loading={action.pending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
