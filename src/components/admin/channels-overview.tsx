"use client";

import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { deleteBlockAction } from "@/actions/calendar";
import { syncAllIntegrationsAction, syncIntegrationAction } from "@/actions/properties";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { useAction } from "./use-action";

export function SyncAllButton() {
  const t = useTranslations("admin.availability");
  const action = useAction();
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        loading={action.pending}
        onClick={() =>
          action.run(() => syncAllIntegrationsAction(), {
            success: false,
            onSuccess: ({ synced, failed }) => (failed ? toast.warning(t("syncedWithErrors", { synced, failed })) : toast.success(t("syncedAll", { synced }))),
          })
        }
      >
        <ArrowsClockwiseIcon size={16} />
        {t("syncAll")}
      </Button>
      {action.error ? <Notice tone="danger">{action.error}</Notice> : null}
    </div>
  );
}

export function SyncOneButton({ id }: { id: string }) {
  const t = useTranslations("admin.availability");
  const action = useAction();
  return (
    <Button variant="ghost" size="sm" loading={action.pending} onClick={() => action.run(() => syncIntegrationAction(id), { success: false, onSuccess: ({ events }) => toast.success(t("syncedOne", { count: events })) })}>
      <ArrowsClockwiseIcon size={15} />
      {t("sync")}
    </Button>
  );
}

export function UnblockButton({ id }: { id: string }) {
  const t = useTranslations("admin.availability");
  const action = useAction();
  return (
    <Button variant="danger-ghost" size="sm" disabled={action.pending} onClick={() => window.confirm(t("confirmUnblock")) && action.run(() => deleteBlockAction(id), { success: t("unblocked") })}>
      {t("unblock")}
    </Button>
  );
}
