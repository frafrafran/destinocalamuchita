"use client";

import { CaretLeftIcon, CaretRightIcon, LockSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { createBlockAction, deleteBlockAction } from "@/actions/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger, Tabs, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { type ISODate, addDays, dayOfWeek, diffDays, maxDate, minDate, toDbDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useAction } from "./use-action";

export type BoardRange =
  | { kind: "RESERVATION"; id: string; start: ISODate; end: ISODate; code: string; status: string; statusLabel: string; guestName: string; hasConflict: boolean }
  | { kind: "BLOCK"; id: string; start: ISODate; end: ISODate; reason: string; reasonLabel: string; note: string | null }
  | { kind: "EXTERNAL"; id: string; start: ISODate; end: ISODate; channel: string; summary: string; eventKind: string; hasConflict: boolean };

export interface BoardRow {
  id: string;
  title: string;
  ranges: BoardRange[];
}

interface Props {
  rows: BoardRow[];
  view: "month" | "week" | "list";
  start: ISODate;
  end: ISODate;
  today: ISODate;
  canWrite: boolean;
  propertyFilter: string | null;
  properties: { id: string; title: string }[];
}

const PENDING = new Set(["PENDING", "AWAITING_PAYMENT", "PROOF_RECEIVED", "UNDER_REVIEW"]);

function barClasses(range: BoardRange): string {
  if (range.kind === "BLOCK") return "bg-cal-blocked text-ink-2";
  if (range.kind === "EXTERNAL") return "bg-cal-external text-ink";
  if (PENDING.has(range.status)) return "bg-cal-pending text-ink";
  return "bg-cal-booked text-accent-ink";
}

/** Blocks read like the form (first and last blocked night); stays show check-in and check-out. */
function lastShownDay(range: BoardRange): ISODate {
  return range.kind === "BLOCK" ? addDays(range.end, -1) : range.end;
}

export function CalendarBoard({ rows, view, start, end, today, canWrite, propertyFilter, properties }: Props) {
  const t = useTranslations("admin.calendar");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const block = useAction();
  const unblock = useAction();
  const [dialog, setDialog] = useState<{ propertyId: string; startDate: ISODate; lastDate: ISODate; reason: string; note: string } | null>(null);

  const days = Array.from({ length: diffDays(start, end) }, (_, i) => addDays(start, i));
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
  const period = new Intl.DateTimeFormat(locale, view === "week" ? { day: "numeric", month: "long", timeZone: "UTC" } : { month: "long", year: "numeric", timeZone: "UTC" });
  const shortDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });

  function navigate(changes: Record<string, string | null>) {
    const params = new URLSearchParams({ view, date: start, ...(propertyFilter ? { property: propertyFilter } : {}) });
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }
  const step = view === "week" ? 7 : diffDays(start, end);
  const previous = view === "week" ? addDays(start, -7) : addDays(start, -1).slice(0, 7) + "-01";

  // Definite widths (not max-content) so a long label in a one-night bar can never stretch the columns.
  const columnMin = view === "week" ? 110 : 40;
  const gridStyle = { gridTemplateColumns: `220px repeat(${days.length}, minmax(${columnMin}px, 1fr))` };

  // Bring today's column into view when the month is wider than the screen (a DOM sync, no state).
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cell = scroller.current?.querySelector<HTMLElement>("[data-today]");
    const box = scroller.current;
    if (!cell || !box) return;
    box.scrollLeft = Math.max(0, cell.offsetLeft - 220 - columnMin * 2);
  }, [start, view, columnMin]);

  const openBlock = (propertyId: string, date: ISODate) => canWrite && setDialog({ propertyId, startDate: date, lastDate: date, reason: "MANUAL", note: "" });

  const legend = [
    ["bg-cal-booked", t("legend.confirmed")],
    ["bg-cal-pending", t("legend.pending")],
    ["bg-cal-external", t("legend.external")],
    ["bg-cal-blocked", t("legend.blocked")],
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="icon" onClick={() => navigate({ date: previous })} aria-label={t("previous")}>
            <CaretLeftIcon size={16} />
          </Button>
          <Button variant="secondary" size="icon" onClick={() => navigate({ date: addDays(start, step) })} aria-label={t("next")}>
            <CaretRightIcon size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate({ date: null })}>
            {t("today")}
          </Button>
        </div>
        <h2 className="text-lg font-semibold tracking-tight first-letter:uppercase">
          {view === "week" ? `${period.format(toDbDate(start))} - ${period.format(toDbDate(addDays(end, -1)))}` : period.format(toDbDate(start))}
        </h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select aria-label={t("property")} value={propertyFilter ?? ""} onChange={(event) => navigate({ property: event.target.value || null })} className="h-10 w-auto text-sm">
            <option value="">{t("allProperties")}</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.title}
              </option>
            ))}
          </Select>
          <Tabs value={view} onValueChange={(value) => navigate({ view: value })}>
            <TabsList>
              <TabsTrigger value="month">{t("views.month")}</TabsTrigger>
              <TabsTrigger value="week">{t("views.week")}</TabsTrigger>
              <TabsTrigger value="list">{t("views.list")}</TabsTrigger>
            </TabsList>
          </Tabs>
          {canWrite ? (
            <Button size="sm" onClick={() => setDialog({ propertyId: propertyFilter ?? properties[0]?.id ?? "", startDate: today, lastDate: today, reason: "MANUAL", note: "" })}>
              <LockSimpleIcon size={15} />
              {t("block")}
            </Button>
          ) : null}
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-3">
        {legend.map(([color, label]) => (
          <li key={label} className="flex items-center gap-2">
            <span aria-hidden className={cn("h-3 w-5 rounded", color)} />
            {label}
          </li>
        ))}
        {canWrite && view !== "list" ? <li>{t("clickHint")}</li> : null}
      </ul>

      {unblock.error ? <Notice tone="danger">{unblock.error}</Notice> : null}

      {view === "list" ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {rows
              .flatMap((row) => row.ranges.map((range) => ({ row, range })))
              .sort((a, b) => a.range.start.localeCompare(b.range.start))
              .map(({ row, range }) => (
                <li key={`${range.kind}-${range.id}`} className="flex flex-wrap items-center gap-4 px-5 py-3.5 text-sm">
                  <span aria-hidden className={cn("h-8 w-1.5 rounded-full", barClasses(range))} />
                  <span className="w-40 shrink-0 tabular">
                    {shortDate.format(toDbDate(range.start))} - {shortDate.format(toDbDate(lastShownDay(range)))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{rangeTitle(range, t)}</span>
                    <span className="block truncate text-ink-3">{row.title}</span>
                  </span>
                  <RangeBadge range={range} t={t} />
                  {range.kind === "RESERVATION" ? (
                    <Link href={`/admin/reservas/${range.id}`} className="text-sm font-medium text-accent-text hover:underline">
                      {t("open")}
                    </Link>
                  ) : null}
                  {range.kind === "BLOCK" && canWrite ? (
                    <Button variant="danger-ghost" size="sm" disabled={unblock.pending} onClick={() => window.confirm(t("confirmUnblock")) && unblock.run(() => deleteBlockAction(range.id), { success: t("unblocked") })}>
                      {t("unblock")}
                    </Button>
                  ) : null}
                </li>
              ))}
          </ul>
          {rows.every((row) => row.ranges.length === 0) ? <p className="px-5 py-10 text-center text-sm text-ink-3">{t("emptyPeriod")}</p> : null}
        </div>
      ) : (
        <div ref={scroller} className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <div style={{ minWidth: 220 + days.length * columnMin }}>
            <div className="sticky top-0 z-10 grid border-b border-line bg-surface" style={gridStyle}>
              <div className="sticky left-0 z-10 bg-surface px-4 py-2 text-xs font-medium text-ink-3">{t("property")}</div>
              {days.map((day) => {
                const weekend = dayOfWeek(day) === 0 || dayOfWeek(day) === 6;
                return (
                  <div key={day} data-today={day === today || undefined} className={cn("border-l border-line py-2 text-center text-xs", weekend ? "bg-surface-2/60" : "", day === today && "bg-accent-soft")}>
                    <span className="block text-ink-3 uppercase">{weekday.format(toDbDate(day))}</span>
                    <span className={cn("tabular block font-medium", day === today && "text-accent-text")}>{Number(day.slice(8))}</span>
                  </div>
                );
              })}
            </div>
            {rows.map((row) => (
              <div key={row.id} className="grid border-b border-line last:border-0" style={gridStyle}>
                <div className="sticky left-0 z-[5] flex items-center bg-surface px-4 py-3 text-sm font-medium" style={{ gridRow: 1, gridColumn: 1 }}>
                  <span className="truncate">{row.title}</span>
                </div>
                {days.map((day, index) => (
                  <button
                    key={day}
                    type="button"
                    tabIndex={canWrite && day >= today ? 0 : -1}
                    disabled={!canWrite || day < today}
                    onClick={() => openBlock(row.id, day)}
                    aria-label={t("blockDay", { property: row.title, date: shortDate.format(toDbDate(day)) })}
                    className={cn("h-14 border-l border-line transition-colors enabled:hover:bg-accent-soft/50", day === today && "bg-accent-soft/40")}
                    style={{ gridRow: 1, gridColumn: index + 2 }}
                  />
                ))}
                {row.ranges.map((range) => {
                  const from = maxDate(range.start, start);
                  const to = minDate(range.end, end);
                  if (from >= to) return null;
                  const column = `${diffDays(start, from) + 2} / ${diffDays(start, to) + 2}`;
                  const clippedStart = range.start < start;
                  const clippedEnd = range.end > end;
                  const bar = (
                    <span
                      className={cn(
                        "relative z-[4] mx-0.5 my-2.5 flex min-w-0 items-center gap-1.5 overflow-hidden px-2 text-xs font-medium whitespace-nowrap shadow-hairline",
                        barClasses(range),
                        clippedStart ? "rounded-l-none" : "rounded-l-lg",
                        clippedEnd ? "rounded-r-none" : "rounded-r-lg",
                        "hasConflict" in range && range.hasConflict && "ring-2 ring-danger-fg",
                      )}
                    >
                      <span className="truncate">{rangeTitle(range, t)}</span>
                    </span>
                  );
                  return (
                    <div key={`${range.kind}-${range.id}`} className="flex" style={{ gridRow: 1, gridColumn: column }}>
                      {range.kind === "RESERVATION" ? (
                        <Link href={`/admin/reservas/${range.id}`} className="flex min-w-0 flex-1" title={`${range.code} · ${range.guestName}`}>
                          {bar}
                        </Link>
                      ) : (
                        <Popover>
                          <PopoverTrigger className="flex min-w-0 flex-1 text-left">{bar}</PopoverTrigger>
                          <PopoverContent className="w-72 space-y-3 text-sm">
                            <p className="font-semibold">{rangeTitle(range, t)}</p>
                            <p className="text-ink-3">
                              {shortDate.format(toDbDate(range.start))} - {shortDate.format(toDbDate(lastShownDay(range)))} (
                              {t("nights", { count: diffDays(range.start, range.end) })})
                            </p>
                            {range.kind === "BLOCK" && range.note ? <p className="whitespace-pre-line text-ink-2">{range.note}</p> : null}
                            {range.kind === "EXTERNAL" ? <p className="text-ink-2">{t("externalHint")}</p> : null}
                            {range.kind === "BLOCK" && canWrite ? (
                              <Button variant="danger-ghost" size="sm" disabled={unblock.pending} onClick={() => unblock.run(() => deleteBlockAction(range.id), { success: t("unblocked") })}>
                                {t("unblock")}
                              </Button>
                            ) : null}
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog ? (
          <DialogContent
            title={t("blockTitle")}
            description={t("blockDescription")}
            closeLabel={tc("close")}
            footer={
              <>
                <Link href={`/admin/reservas/nueva`} className="mr-auto inline-flex h-11 items-center gap-1.5 px-2 text-sm font-medium text-accent-text">
                  <PlusIcon size={15} />
                  {t("orCreateBooking")}
                </Link>
                <Button variant="ghost" onClick={() => setDialog(null)}>
                  {tc("cancel")}
                </Button>
                <Button loading={block.pending} onClick={() => block.run(() => createBlockAction(dialog as Parameters<typeof createBlockAction>[0]), { success: t("blocked"), onSuccess: () => setDialog(null) })}>
                  {t("block")}
                </Button>
              </>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {block.error ? <Notice tone="danger" className="sm:col-span-2">{block.error}</Notice> : null}
              <Field label={t("property")} className="sm:col-span-2" error={block.fieldErrors.propertyId}>
                {(props) => (
                  <Select {...props} value={dialog.propertyId} onChange={(event) => setDialog({ ...dialog, propertyId: event.target.value })}>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.title}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t("from")} error={block.fieldErrors.startDate}>
                {(props) => <Input {...props} type="date" value={dialog.startDate} min={today} onChange={(event) => setDialog({ ...dialog, startDate: event.target.value, lastDate: maxDate(event.target.value, dialog.lastDate) })} />}
              </Field>
              <Field label={t("until")} hint={t("untilHint")} error={block.fieldErrors.lastDate}>
                {(props) => <Input {...props} type="date" value={dialog.lastDate} min={dialog.startDate} onChange={(event) => setDialog({ ...dialog, lastDate: event.target.value })} />}
              </Field>
              <Field label={t("reason")} className="sm:col-span-2">
                {(props) => (
                  <Select {...props} value={dialog.reason} onChange={(event) => setDialog({ ...dialog, reason: event.target.value })}>
                    {(["OWNER_USE", "MAINTENANCE", "MANUAL", "OTHER"] as const).map((reason) => (
                      <option key={reason} value={reason}>
                        {t(`reasons.${reason}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t("note")} className="sm:col-span-2">
                {(props) => <Textarea {...props} rows={3} value={dialog.note} onChange={(event) => setDialog({ ...dialog, note: event.target.value })} maxLength={300} />}
              </Field>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

type Translator = (key: string, values?: Record<string, string | number>) => string;

function rangeTitle(range: BoardRange, t: Translator): string {
  if (range.kind === "RESERVATION") return `${range.guestName}`;
  if (range.kind === "BLOCK") return range.reasonLabel;
  return `${range.channel}${range.eventKind === "BLOCKED" ? ` · ${t("externalBlocked")}` : ""}`;
}

function RangeBadge({ range, t }: { range: BoardRange; t: Translator }) {
  if (range.kind === "RESERVATION") return <Badge tone={PENDING.has(range.status) ? "warning" : "success"}>{range.statusLabel}</Badge>;
  if (range.kind === "BLOCK") return <Badge tone="neutral">{t("legend.blocked")}</Badge>;
  return <Badge tone={range.hasConflict ? "danger" : "info"}>{range.channel}</Badge>;
}
