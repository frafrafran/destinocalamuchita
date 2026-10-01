"use client";

import { ArrowSquareOutIcon, CheckCircleIcon, CircleIcon, TrashIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { deletePropertyAction, setPropertyStatusAction } from "@/actions/properties";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Link, useRouter } from "@/i18n/navigation";
import type { PublishChecklist } from "@/server/queries/properties";
import { useAction } from "../use-action";

const TONES = { DRAFT: "neutral", PUBLISHED: "success", PAUSED: "warning", ARCHIVED: "muted" } as const;

export function PublishStep({
  propertyId,
  slug,
  status,
  checklist,
  reservations,
  canDelete,
}: {
  propertyId: string;
  slug: string;
  status: keyof typeof TONES;
  checklist: PublishChecklist;
  reservations: number;
  canDelete: boolean;
}) {
  const t = useTranslations("admin.property.publish");
  const tStatus = useTranslations("status.property");
  const router = useRouter();
  const action = useAction();
  const ready = Object.values(checklist).every(Boolean);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <section className="rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">{t("checklist")}</h2>
          <Badge tone={TONES[status]}>{tStatus(status)}</Badge>
        </div>
        <ul className="mt-5 space-y-3">
          {(Object.keys(checklist) as (keyof PublishChecklist)[]).map((key) => (
            <li key={key} className="flex items-start gap-3 text-sm">
              {checklist[key] ? <CheckCircleIcon size={20} weight="fill" className="shrink-0 text-success-fg" /> : <CircleIcon size={20} className="shrink-0 text-ink-3" />}
              <span>
                <span className="font-medium">{t(`items.${key}.title`)}</span>
                <span className="block text-ink-3">{t(`items.${key}.body`)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4 rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-semibold">{t("visibility")}</h2>
        {action.error ? <Notice tone="danger">{action.error}</Notice> : null}
        {!ready && status !== "PUBLISHED" ? <Notice tone="warning">{t("notReady")}</Notice> : null}
        <div className="flex flex-wrap gap-2">
          {status !== "PUBLISHED" ? (
            <Button disabled={!ready} loading={action.pending} onClick={() => action.run(() => setPropertyStatusAction(propertyId, "PUBLISHED"), { success: t("published") })}>
              {t("publish")}
            </Button>
          ) : (
            <Button variant="secondary" loading={action.pending} onClick={() => action.run(() => setPropertyStatusAction(propertyId, "PAUSED"))}>
              {t("pause")}
            </Button>
          )}
          {status !== "DRAFT" && status !== "ARCHIVED" ? (
            <Button variant="ghost" disabled={action.pending} onClick={() => action.run(() => setPropertyStatusAction(propertyId, "DRAFT"))}>
              {t("toDraft")}
            </Button>
          ) : null}
          {status === "PUBLISHED" ? (
            <Link href={`/propiedades/${slug}`} target="_blank" className="inline-flex h-11 items-center gap-1.5 px-3 text-sm font-medium text-accent-text">
              <ArrowSquareOutIcon size={16} />
              {t("view")}
            </Link>
          ) : null}
        </div>
        <p className="text-sm text-ink-3">{t("pauseHint")}</p>

        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-sm font-semibold">{t("dangerZone")}</h3>
          <p className="mt-1 text-sm text-ink-3">{reservations > 0 ? t("archiveHint", { count: reservations }) : t("deleteHint")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {status !== "ARCHIVED" ? (
              <Button variant="secondary" size="sm" disabled={action.pending} onClick={() => window.confirm(t("confirmArchive")) && action.run(() => setPropertyStatusAction(propertyId, "ARCHIVED"))}>
                {t("archive")}
              </Button>
            ) : null}
            {canDelete && reservations === 0 ? (
              <Button
                variant="danger-ghost"
                size="sm"
                disabled={action.pending}
                onClick={() =>
                  window.confirm(t("confirmDelete")) &&
                  action.run(() => deletePropertyAction(propertyId), { success: t("deleted"), onSuccess: () => router.push("/admin/propiedades") })
                }
              >
                <TrashIcon size={15} />
                {t("delete")}
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
