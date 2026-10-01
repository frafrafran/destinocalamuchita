"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/action-result";

/** Runs a Server Action with pending state, field errors, a translated error message and a success toast. */
export function useAction() {
  const te = useTranslations("errors");
  const t = useTranslations("admin.common");
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function run<T>(action: () => Promise<ActionResult<T>>, options: { success?: string | false; onSuccess?: (data: T) => void } = {}) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        if (options.success !== false) toast.success(options.success ?? t("saved"));
        options.onSuccess?.(result.data);
        return;
      }
      setFieldErrors(result.fieldErrors ?? {});
      setError(te(result.error));
    });
  }

  return { run, pending, fieldErrors, error, clear: () => setError(null) };
}
