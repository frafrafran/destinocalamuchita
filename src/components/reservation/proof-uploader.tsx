"use client";

import { CheckCircleIcon, FileArrowUpIcon, FilePdfIcon, ImageIcon, XIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { type DragEvent, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "application/pdf"];

/** Drag-and-drop or pick a receipt, add the transferred amount, send. */
export function ProofUploader({ code, suggestedAmount }: { code: string; suggestedAmount: string }) {
  const t = useTranslations("reservation.upload");
  const te = useTranslations("errors");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState(suggestedAmount);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function choose(candidate: File | undefined) {
    setError(null);
    setDone(false);
    if (!candidate) return;
    if (!ACCEPT.includes(candidate.type)) return setError(te("FILE_TYPE"));
    if (candidate.size > MAX_BYTES) return setError(t("tooLarge", { max: 10 }));
    setFile(candidate);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  }

  function send() {
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    body.set("declaredAmount", amount);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/reservations/${code}/proof`, { method: "POST", body });
        const result = (await response.json()) as { ok: boolean; error?: string; details?: { maxMb?: number; max?: number } };
        if (!result.ok) {
          setError(result.error === "FILE_TOO_LARGE" ? t("tooLarge", { max: result.details?.maxMb ?? 10 }) : te((result.error ?? "UNKNOWN") as "UNKNOWN"));
          return;
        }
        setDone(true);
        setFile(null);
        router.refresh();
      } catch {
        setError(te("UNKNOWN"));
      }
    });
  }

  const FileIcon = file?.type === "application/pdf" ? FilePdfIcon : ImageIcon;

  return (
    <div className="space-y-4">
      {done ? (
        <Notice tone="success" icon={<CheckCircleIcon size={18} weight="fill" />} title={t("successTitle")}>
          {t("successBody")}
        </Notice>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-surface-2/50",
        )}
      >
        {file ? (
          <div className="flex w-full max-w-md items-center gap-3 rounded-xl bg-surface p-3 text-left shadow-hairline">
            <FileIcon size={28} className="shrink-0 text-accent-text" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-ink-3">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <button type="button" onClick={() => setFile(null)} className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={t("remove")}>
              <XIcon size={16} />
            </button>
          </div>
        ) : (
          <>
            <FileArrowUpIcon size={32} className="text-accent-text" />
            <div>
              <p className="font-medium">{t("dropTitle")}</p>
              <p className="mt-1 text-sm text-ink-3">{t("formats")}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => input.current?.click()}>
              {t("choose")}
            </Button>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept={ACCEPT.join(",")}
          className="sr-only"
          aria-label={t("choose")}
          onChange={(event) => {
            choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label={t("amount")} hint={t("amountHint")}>
          {(props) => <Input {...props} inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} maxLength={20} />}
        </Field>
        <Button size="lg" onClick={send} disabled={!file} loading={pending}>
          {t("submit")}
        </Button>
      </div>
    </div>
  );
}
