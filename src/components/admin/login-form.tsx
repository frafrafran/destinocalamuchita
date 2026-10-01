"use client";

import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import { loginAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("admin.login");
  const te = useTranslations("errors");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setErrors({});
    startTransition(async () => {
      const result = await loginAction({ email, password, next });
      if (!result.ok) {
        if (result.error === "VALIDATION") setErrors(result.fieldErrors ?? {});
        else setError(te(result.error));
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label={t("email")} error={errors.email} required>
        {(props) => <Input {...props} type="email" autoComplete="username" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} />}
      </Field>
      <Field label={t("password")} error={errors.password} required>
        {(props) => (
          <div className="relative">
            <Input {...props} type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="pr-12" />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
              aria-label={show ? t("hidePassword") : t("showPassword")}
            >
              {show ? <EyeSlashIcon size={18} /> : <EyeIcon size={18} />}
            </button>
          </div>
        )}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
