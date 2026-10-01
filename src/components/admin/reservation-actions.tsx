"use client";

import { CaretDownIcon, CheckIcon, EnvelopeSimpleIcon, EyeIcon, KeyIcon, CalendarBlankIcon, ProhibitIcon, XCircleIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  changeDatesAction,
  closeReservationAction,
  confirmReservationAction,
  markUnderReviewAction,
  sendGuestLinkAction,
  updateAdminNotesAction,
} from "@/actions/reservations";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Switch } from "@/components/ui/primitives";
import type { ActionResult } from "@/server/action-result";

type Dialogs = "confirm" | "dates" | "cancel" | "reject" | null;

export interface ReservationActionState {
  id: string;
  status: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  maxGuests: number;
  amountDue: string;
  hasConflict: boolean;
  canReview: boolean;
  canWrite: boolean;
}

function useActionRunner() {
  const te = useTranslations("errors");
  const t = useTranslations("admin.reservation");
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<ActionResult<unknown>>, onSuccess?: () => void) => {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(t("saved"));
        onSuccess?.();
      } else {
        setFieldErrors(result.fieldErrors ?? {});
        setError(te(result.error));
      }
    });
  };
  const reset = () => {
    setError(null);
    setFieldErrors({});
  };
  return { pending, fieldErrors, error, run, reset };
}

export function ReservationActions({ state }: { state: ReservationActionState }) {
  const t = useTranslations("admin.reservation");
  const tc = useTranslations("common");
  const [dialog, setDialog] = useState<Dialogs>(null);
  const runner = useActionRunner();
  const [amount, setAmount] = useState(state.amountDue);
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [dates, setDates] = useState({ checkIn: state.checkIn, checkOut: state.checkOut, guests: String(state.guests), pricing: "KEEP" as "KEEP" | "RECALCULATE" });

  const open = ["PENDING", "AWAITING_PAYMENT", "PROOF_RECEIVED", "UNDER_REVIEW"].includes(state.status);
  const active = open || state.status === "CONFIRMED";
  const close = () => {
    setDialog(null);
    runner.reset();
  };

  const dialogShell = (key: Exclude<Dialogs, null>, title: string, description: string, body: ReactNode, footer: ReactNode) => (
    <Dialog key={key} open={dialog === key} onOpenChange={(value) => (value ? setDialog(key) : close())}>
      <DialogContent title={title} description={description} closeLabel={tc("close")} footer={footer}>
        <div className="space-y-4">
          {runner.error ? <Notice tone="danger">{runner.error}</Notice> : null}
          {body}
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="flex flex-wrap gap-2">
      {state.canReview && state.status === "PROOF_RECEIVED" ? (
        <Button variant="secondary" loading={runner.pending} onClick={() => runner.run(() => markUnderReviewAction(state.id))}>
          <EyeIcon size={16} />
          {t("markReview")}
        </Button>
      ) : null}
      {state.canReview && open ? (
        <Button onClick={() => setDialog("confirm")} disabled={state.hasConflict}>
          <CheckIcon size={16} weight="bold" />
          {t("confirm")}
        </Button>
      ) : null}
      {state.canWrite ? (
        <Menu>
          <MenuTrigger asChild>
            <Button variant="secondary">
              {t("more")}
              <CaretDownIcon size={14} />
            </Button>
          </MenuTrigger>
          <MenuContent>
            {active ? (
              <MenuItem onSelect={() => setDialog("dates")}>
                <CalendarBlankIcon size={16} />
                {t("changeDates")}
              </MenuItem>
            ) : null}
            <MenuItem onSelect={() => runner.run(() => sendGuestLinkAction(state.id, false))}>
              <EnvelopeSimpleIcon size={16} />
              {t("sendLink")}
            </MenuItem>
            <MenuItem onSelect={() => runner.run(() => sendGuestLinkAction(state.id, true))}>
              <KeyIcon size={16} />
              {t("revokeLinks")}
            </MenuItem>
            {active ? <MenuSeparator /> : null}
            {open ? (
              <MenuItem destructive onSelect={() => setDialog("reject")}>
                <ProhibitIcon size={16} />
                {t("reject")}
              </MenuItem>
            ) : null}
            {active ? (
              <MenuItem destructive onSelect={() => setDialog("cancel")}>
                <XCircleIcon size={16} />
                {t("cancel")}
              </MenuItem>
            ) : null}
          </MenuContent>
        </Menu>
      ) : null}

      {dialogShell(
        "confirm",
        t("confirmTitle"),
        t("confirmDescription"),
        <>
          <Field label={t("amountReceived")} hint={t("amountReceivedHint")} error={runner.fieldErrors.amountReceived}>
            {(props) => <Input {...props} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />}
          </Field>
          <Field label={`${t("note")} (${tc("optional")})`}>{(props) => <Textarea {...props} rows={3} value={note} onChange={(event) => setNote(event.target.value)} />}</Field>
        </>,
        <>
          <Button variant="ghost" onClick={close}>
            {tc("cancel")}
          </Button>
          <Button loading={runner.pending} onClick={() => runner.run(() => confirmReservationAction(state.id, { amountReceived: amount, note }), close)}>
            {t("confirm")}
          </Button>
        </>,
      )}

      {dialogShell(
        "dates",
        t("changeDates"),
        t("changeDatesDescription"),
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("checkIn")} error={runner.fieldErrors.checkIn}>
            {(props) => <Input {...props} type="date" value={dates.checkIn} onChange={(event) => setDates({ ...dates, checkIn: event.target.value })} />}
          </Field>
          <Field label={t("checkOut")} error={runner.fieldErrors.checkOut}>
            {(props) => <Input {...props} type="date" value={dates.checkOut} onChange={(event) => setDates({ ...dates, checkOut: event.target.value })} />}
          </Field>
          <Field label={t("guests")} error={runner.fieldErrors.guests}>
            {(props) => <Input {...props} type="number" min={1} max={state.maxGuests} value={dates.guests} onChange={(event) => setDates({ ...dates, guests: event.target.value })} />}
          </Field>
          <Field label={t("pricing")}>
            {(props) => (
              <Select {...props} value={dates.pricing} onChange={(event) => setDates({ ...dates, pricing: event.target.value as "KEEP" | "RECALCULATE" })}>
                <option value="KEEP">{t("pricingKeep")}</option>
                <option value="RECALCULATE">{t("pricingRecalculate")}</option>
              </Select>
            )}
          </Field>
          <label className="flex items-center gap-3 text-sm sm:col-span-2">
            <Switch checked={notify} onCheckedChange={setNotify} />
            {t("notifyGuest")}
          </label>
        </div>,
        <>
          <Button variant="ghost" onClick={close}>
            {tc("cancel")}
          </Button>
          <Button
            loading={runner.pending}
            onClick={() => runner.run(() => changeDatesAction(state.id, { ...dates, guests: Number(dates.guests), notifyGuest: notify }), close)}
          >
            {tc("save")}
          </Button>
        </>,
      )}

      {(["cancel", "reject"] as const).map((kind) =>
        dialogShell(
          kind,
          t(`${kind}Title`),
          t(`${kind}Description`),
          <>
            <Field label={t("reason")} hint={t("reasonHint")} error={runner.fieldErrors.reason}>
              {(props) => <Textarea {...props} rows={3} value={note} onChange={(event) => setNote(event.target.value)} />}
            </Field>
            {kind === "cancel" ? (
              <label className="flex items-center gap-3 text-sm">
                <Switch checked={notify} onCheckedChange={setNotify} />
                {t("notifyGuest")}
              </label>
            ) : null}
          </>,
          <>
            <Button variant="ghost" onClick={close}>
              {tc("back")}
            </Button>
            <Button variant="danger" loading={runner.pending} onClick={() => runner.run(() => closeReservationAction(state.id, kind, { reason: note, notifyGuest: notify }), close)}>
              {t(kind)}
            </Button>
          </>,
        ),
      )}
    </div>
  );
}

export function AdminNotes({ reservationId, initial, canWrite }: { reservationId: string; initial: string; canWrite: boolean }) {
  const t = useTranslations("admin.reservation");
  const [value, setValue] = useState(initial);
  const runner = useActionRunner();
  return (
    <div className="space-y-3">
      <Textarea value={value} onChange={(event) => setValue(event.target.value)} rows={4} placeholder={t("notesPlaceholder")} aria-label={t("notes")} disabled={!canWrite} />
      {runner.error ? <p className="text-sm text-danger-fg">{runner.error}</p> : null}
      {canWrite ? (
        <Button size="sm" variant="secondary" disabled={value === initial} loading={runner.pending} onClick={() => runner.run(() => updateAdminNotesAction(reservationId, value))}>
          {t("saveNotes")}
        </Button>
      ) : null}
    </div>
  );
}
