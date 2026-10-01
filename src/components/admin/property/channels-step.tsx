"use client";

import { ArrowsClockwiseIcon, CheckCircleIcon, LinkSimpleIcon, PauseIcon, PlayIcon, TrashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { addIntegrationAction, deleteIntegrationAction, rotateExportTokenAction, syncIntegrationAction, toggleIntegrationAction } from "@/actions/properties";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { CopyButton } from "@/components/ui/primitives";
import { useAction } from "../use-action";

export interface ChannelRow {
  id: string;
  channel: "AIRBNB" | "BOOKING" | "VRBO" | "GOOGLE" | "OTHER";
  name: string;
  importUrl: string;
  isActive: boolean;
  lastSyncedAt: string | null;
  lastSyncStatus: "SUCCESS" | "FAILED" | null;
  lastSyncError: string | null;
  events: number;
}

const CHANNEL_NAMES = { AIRBNB: "Airbnb", BOOKING: "Booking.com", VRBO: "Vrbo", GOOGLE: "Google Calendar", OTHER: "iCal" } as const;

export function ChannelsStep({ propertyId, exportUrl, channels, canManage }: { propertyId: string; exportUrl: string; channels: ChannelRow[]; canManage: boolean }) {
  const t = useTranslations("admin.property.channels");
  const tc = useTranslations("common");
  const locale = useLocale();
  const add = useAction();
  const row = useAction();
  const [draft, setDraft] = useState({ channel: "AIRBNB" as ChannelRow["channel"], name: "Airbnb", importUrl: "" });
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", hourCycle: locale === "en" ? "h12" : "h23", timeZone: "America/Argentina/Cordoba" });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-semibold">{t("importTitle")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-3">{t("importHint")}</p>

        {canManage ? (
          <form
            className="mt-5 grid gap-4 sm:grid-cols-[180px_1fr_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              add.run(() => addIntegrationAction(propertyId, draft), {
                success: false,
                onSuccess: (result) => {
                  if (result.synced) toast.success(t("addedAndSynced"));
                  else toast.warning(t("addedButFailed", { error: result.error ?? "" }));
                  setDraft({ ...draft, importUrl: "" });
                },
              });
            }}
          >
            <Field label={t("channel")}>
              {(props) => (
                <Select {...props} value={draft.channel} onChange={(event) => setDraft({ ...draft, channel: event.target.value as ChannelRow["channel"], name: CHANNEL_NAMES[event.target.value as ChannelRow["channel"]] })}>
                  {Object.entries(CHANNEL_NAMES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("url")} error={add.fieldErrors.importUrl} hint={t("urlHint")}>
              {(props) => <Input {...props} type="url" value={draft.importUrl} onChange={(event) => setDraft({ ...draft, importUrl: event.target.value })} placeholder="https://www.airbnb.com/calendar/ical/…" />}
            </Field>
            <Button type="submit" loading={add.pending} className="sm:mb-0.5">
              <LinkSimpleIcon size={16} />
              {t("connect")}
            </Button>
          </form>
        ) : null}
        {add.error ? <Notice tone="danger" className="mt-4">{add.error}</Notice> : null}
        {row.error ? <Notice tone="danger" className="mt-4">{row.error}</Notice> : null}

        {channels.length ? (
          <ul className="mt-6 divide-y divide-line rounded-2xl border border-line">
            {channels.map((channel) => (
              <li key={channel.id} className="flex flex-wrap items-center gap-4 px-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{channel.name}</p>
                    {!channel.isActive ? (
                      <Badge tone="muted">{t("paused")}</Badge>
                    ) : channel.lastSyncStatus === "FAILED" ? (
                      <Badge tone="danger" icon={<WarningCircleIcon size={12} weight="fill" />}>
                        {t("failing")}
                      </Badge>
                    ) : channel.lastSyncStatus === "SUCCESS" ? (
                      <Badge tone="success" icon={<CheckCircleIcon size={12} weight="fill" />}>
                        {t("ok")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-3">{channel.importUrl}</p>
                  <p className="mt-1 text-xs text-ink-3">
                    {channel.lastSyncedAt ? t("lastSync", { date: dateTime.format(new Date(channel.lastSyncedAt)), count: channel.events }) : t("neverSynced")}
                  </p>
                  {channel.lastSyncError ? <p className="mt-1 text-xs text-danger-fg">{channel.lastSyncError}</p> : null}
                </div>
                {canManage ? (
                  <div className="flex gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={row.pending || !channel.isActive}
                      onClick={() => row.run(() => syncIntegrationAction(channel.id), { success: false, onSuccess: (result) => toast.success(t("synced", { count: result.events })) })}
                    >
                      <ArrowsClockwiseIcon size={15} />
                      {t("syncNow")}
                    </Button>
                    <Button variant="ghost" size="icon-sm" disabled={row.pending} onClick={() => row.run(() => toggleIntegrationAction(channel.id, !channel.isActive))} aria-label={channel.isActive ? t("pause") : t("resume")}>
                      {channel.isActive ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
                    </Button>
                    <Button
                      variant="danger-ghost"
                      size="icon-sm"
                      disabled={row.pending}
                      onClick={() => window.confirm(t("confirmDelete")) && row.run(() => deleteIntegrationAction(channel.id))}
                      aria-label={t("delete")}
                    >
                      <TrashIcon size={15} />
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 rounded-2xl bg-surface-2 px-4 py-5 text-sm text-ink-3">{t("noChannels")}</p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-semibold">{t("exportTitle")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-3">{t("exportHint")}</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input readOnly value={exportUrl} aria-label={t("exportTitle")} className="font-mono text-xs" onFocus={(event) => event.target.select()} />
          <div className="flex shrink-0 gap-2">
            <CopyButton value={exportUrl} label={tc("copy")} copiedLabel={tc("copied")} className="h-11 px-4" />
            {canManage ? (
              <Button variant="ghost" disabled={row.pending} onClick={() => window.confirm(t("confirmRotate")) && row.run(() => rotateExportTokenAction(propertyId))}>
                {t("rotate")}
              </Button>
            ) : null}
          </div>
        </div>
        <ol className="mt-5 list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
          <li>{t("howto1")}</li>
          <li>{t("howto2")}</li>
          <li>{t("howto3")}</li>
        </ol>
      </section>
    </div>
  );
}
