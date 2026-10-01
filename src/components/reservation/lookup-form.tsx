"use client";

import { EnvelopeSimpleOpenIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import { requestAccessLinkAction } from "@/actions/booking";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";

export function LookupForm({ defaultCode = "" }: { defaultCode?: string }) {
  const t = useTranslations("reservation.lookup");
  const te = useTranslations("errors");
  const [code, setCode] = useState(defaultCode);
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setMessage(null);
    startTransition(async () => {
      const result = await requestAccessLinkAction({ code, email });
      if (result.ok) setMessage({ tone: "success", text: t("sent") });
      else if (result.error === "VALIDATION") setErrors(result.fieldErrors ?? {});
      else setMessage({ tone: "danger", text: te(result.error) });
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {message ? (
        <Notice tone={message.tone} icon={message.tone === "success" ? <EnvelopeSimpleOpenIcon size={18} /> : undefined}>
          {message.text}
        </Notice>
      ) : null}
      <Field label={t("code")} hint={t("codeHint")} error={errors.code} required>
        {(props) => <Input {...props} value={code} onChange={(event) => setCode(event.target.value)} autoCapitalize="characters" placeholder="RMS-XXXXXX" maxLength={10} />}
      </Field>
      <Field label={t("email")} error={errors.email} required>
        {(props) => <Input {...props} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={120} />}
      </Field>
      <Button type="submit" size="lg" loading={pending} className="w-full">
        {t("submit")}
      </Button>
    </form>
  );
}
