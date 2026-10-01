"use client";

import { ArrowSquareOutIcon, CheckIcon, DownloadSimpleIcon, FilePdfIcon, WarningIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { reviewProofAction } from "@/actions/reservations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/field";
import type { StatusTone } from "@/lib/reservation-status";

export interface ProofView {
  id: string;
  fileName: string;
  mimeType: string;
  sizeKb: number;
  uploadedAt: string;
  status: string;
  statusLabel: string;
  statusTone: StatusTone;
  declaredAmount: string | null;
  amountMismatch: boolean;
  reviewNote: string | null;
  reviewedBy: string | null;
  duplicates: { code: string; reservationId: string }[];
}

/** One receipt: preview, warnings (amount mismatch, reused file) and the review decision. */
export function ProofReview({ proof, amountDue, canReview }: { proof: ProofView; amountDue: string; canReview: boolean }) {
  const t = useTranslations("admin.proof");
  const te = useTranslations("errors");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState(amountDue);
  const [error, setError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const url = `/api/admin/proofs/${proof.id}`;
  const isPdf = proof.mimeType === "application/pdf";

  function decide(decision: "APPROVE" | "REJECT" | "REQUEST_NEW") {
    setError(null);
    setNoteError(undefined);
    startTransition(async () => {
      const result = await reviewProofAction(proof.id, decision, { note, amountReceived: amount });
      if (result.ok) toast.success(t(`done.${decision}`));
      else if (result.error === "VALIDATION") setNoteError(result.fieldErrors?.note ?? te("VALIDATION"));
      else setError(te(result.error));
    });
  }

  return (
    <article className="grid gap-5 rounded-2xl border border-line p-4 sm:grid-cols-[180px_1fr]">
      <a href={url} target="_blank" rel="noopener" className="group relative block aspect-[3/4] overflow-hidden rounded-xl bg-surface-2">
        {isPdf ? (
          <span className="grid h-full place-items-center text-ink-3">
            <FilePdfIcon size={44} />
          </span>
        ) : (
          // Private file streamed through an authenticated route; next/image would cache it publicly.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={t("previewAlt", { name: proof.fileName })} className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
        )}
      </a>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{proof.fileName}</p>
            <p className="text-xs text-ink-3">
              {proof.uploadedAt} · {proof.sizeKb} KB
            </p>
          </div>
          <Badge tone={proof.statusTone}>{proof.statusLabel}</Badge>
        </div>

        {proof.declaredAmount ? (
          <p className="text-sm">
            <span className="text-ink-3">{t("declared")} </span>
            <span className="tabular font-medium">{proof.declaredAmount}</span>
          </p>
        ) : null}
        {proof.amountMismatch ? (
          <Notice tone="warning" icon={<WarningIcon size={16} />}>
            {t("mismatch")}
          </Notice>
        ) : null}
        {proof.duplicates.length ? (
          <Notice tone="danger" icon={<WarningIcon size={16} />} title={t("duplicateTitle")}>
            {t("duplicateBody", { codes: proof.duplicates.map((d) => d.code).join(", ") })}
          </Notice>
        ) : null}
        {proof.reviewNote ? (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-2">
            {proof.reviewNote}
            {proof.reviewedBy ? <span className="block text-xs text-ink-3">{proof.reviewedBy}</span> : null}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <a href={url} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-[13px] font-medium hover:bg-surface-2">
            <ArrowSquareOutIcon size={15} />
            {t("open")}
          </a>
          <a href={`${url}?download=1`} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-[13px] font-medium hover:bg-surface-2">
            <DownloadSimpleIcon size={15} />
            {t("download")}
          </a>
        </div>

        {canReview && proof.status === "PENDING_REVIEW" ? (
          <div className="space-y-3 border-t border-line pt-4">
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("amountReceived")}>{(props) => <Input {...props} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />}</Field>
              <Field label={t("note")} hint={t("noteHint")} error={noteError}>
                {(props) => <Textarea {...props} rows={2} value={note} onChange={(event) => setNote(event.target.value)} />}
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" loading={pending} onClick={() => decide("APPROVE")}>
                <CheckIcon size={14} weight="bold" />
                {t("approve")}
              </Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => decide("REQUEST_NEW")}>
                {t("requestNew")}
              </Button>
              <Button size="sm" variant="danger-ghost" disabled={pending} onClick={() => decide("REJECT")}>
                {t("reject")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}
