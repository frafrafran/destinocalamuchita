"use client";

import { PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { deleteRuleAction, deleteSeasonAction, savePricingAction, saveRuleAction, saveSeasonAction } from "@/actions/properties";
import { PriceBreakdown } from "@/components/booking/price-breakdown";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { addDays, todayISO, toDbDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { type PricingConfig, calculateQuote } from "@/lib/pricing";
import { useAction } from "../use-action";

export interface SeasonRow {
  id: string;
  name: string;
  startDate: string;
  lastDate: string;
  nightlyPrice: string;
  weekendPrice: string;
  minNights: string;
}

export type RuleRow =
  | { id: string; type: "SPECIAL_DATE"; name: string; startDate: string; lastDate: string; amount: string }
  | { id: string; type: "LENGTH_DISCOUNT"; name: string; minNights: string; percent: string }
  | { id: string; type: "FEE"; name: string; amount: string; feeUnit: "PER_STAY" | "PER_NIGHT" | "PER_GUEST" | "PER_GUEST_NIGHT" };

interface Props {
  propertyId: string;
  base: { currency: "ARS" | "USD"; basePrice: string; weekendPrice: string; cleaningFee: string; minNights: string; maxNights: string };
  seasons: SeasonRow[];
  rules: RuleRow[];
  config: PricingConfig;
}

type Editing = { kind: "season"; value: SeasonRow } | { kind: "rule"; value: RuleRow } | null;

export function PricingStep({ propertyId, base, seasons, rules, config }: Props) {
  const t = useTranslations("admin.property.pricing");
  const tc = useTranslations("common");
  const locale = useLocale();
  const action = useAction();
  const edit = useAction();
  const remove = useAction();
  const [values, setValues] = useState(base);
  const [editing, setEditing] = useState<Editing>(null);
  const set = (key: keyof typeof values) => (event: { target: { value: string } }) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const money = (value: string) => (value ? formatMoney(Math.round(Number(value) * 100), values.currency, locale) : "-");
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const date = (iso: string) => day.format(toDbDate(iso));

  // Simulator: what a guest would pay, using the saved configuration.
  const [sim, setSim] = useState({ checkIn: addDays(todayISO(), 14), nights: "3", guests: "2" });
  const simulation =
    Number(sim.nights) > 0
      ? calculateQuote({ checkIn: sim.checkIn, checkOut: addDays(sim.checkIn, Number(sim.nights)), guests: Number(sim.guests) || 1, today: todayISO() }, config)
      : null;

  const openSeason = (value?: SeasonRow) =>
    setEditing({ kind: "season", value: value ?? { id: "", name: "", startDate: "", lastDate: "", nightlyPrice: "", weekendPrice: "", minNights: "" } });
  const openRule = (type: RuleRow["type"], value?: RuleRow) =>
    setEditing({
      kind: "rule",
      value:
        value ??
        (type === "SPECIAL_DATE"
          ? { id: "", type, name: "", startDate: "", lastDate: "", amount: "" }
          : type === "LENGTH_DISCOUNT"
            ? { id: "", type, name: "", minNights: "7", percent: "10" }
            : { id: "", type, name: "", amount: "", feeUnit: "PER_STAY" }),
    });

  function saveEditing() {
    if (!editing) return;
    const done = { onSuccess: () => setEditing(null) };
    if (editing.kind === "season") {
      const { id, ...rest } = editing.value;
      edit.run(() => saveSeasonAction(propertyId, { ...rest, ...(id ? { id } : {}) }), done);
    } else {
      const { id, ...rest } = editing.value;
      edit.run(() => saveRuleAction(propertyId, { ...rest, ...(id ? { id } : {}) } as Parameters<typeof saveRuleAction>[1]), done);
    }
  }

  const listSection = (title: string, hint: string, addLabel: string, onAdd: () => void, rows: ReactNode[], empty: string) => (
    <section className="rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-ink-3">{hint}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onAdd}>
          <PlusIcon size={14} />
          {addLabel}
        </Button>
      </div>
      {rows.length ? <ul className="divide-y divide-line">{rows}</ul> : <p className="px-5 py-6 text-sm text-ink-3">{empty}</p>}
    </section>
  );

  const rowActions = (onEdit: () => void, onDelete: () => void) => (
    <div className="flex shrink-0 gap-1">
      <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={t("edit")}>
        <PencilSimpleIcon size={15} />
      </Button>
      <Button variant="danger-ghost" size="icon-sm" disabled={remove.pending} onClick={() => window.confirm(t("confirmDelete")) && onDelete()} aria-label={t("delete")}>
        <TrashIcon size={15} />
      </Button>
    </div>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            action.run(() => savePricingAction(propertyId, values));
          }}
          className="space-y-5 rounded-2xl border border-line bg-surface p-6"
        >
          <h2 className="font-semibold">{t("base")}</h2>
          {action.error ? <Notice tone="danger">{action.error}</Notice> : null}
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label={t("currency")}>
              {(props) => (
                <Select {...props} value={values.currency} onChange={set("currency")}>
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </Select>
              )}
            </Field>
            <Field label={t("basePrice")} required hint={t("perNight")} error={action.fieldErrors.basePrice}>
              {(props) => <Input {...props} inputMode="decimal" value={values.basePrice} onChange={set("basePrice")} />}
            </Field>
            <Field label={t("weekendPrice")} hint={t("weekendHint")} error={action.fieldErrors.weekendPrice}>
              {(props) => <Input {...props} inputMode="decimal" value={values.weekendPrice} onChange={set("weekendPrice")} />}
            </Field>
            <Field label={t("cleaningFee")} hint={t("perStay")} error={action.fieldErrors.cleaningFee}>
              {(props) => <Input {...props} inputMode="decimal" value={values.cleaningFee} onChange={set("cleaningFee")} />}
            </Field>
            <Field label={t("minNights")} required error={action.fieldErrors.minNights}>
              {(props) => <Input {...props} type="number" min={1} value={values.minNights} onChange={set("minNights")} />}
            </Field>
            <Field label={t("maxNights")} hint={t("optional")} error={action.fieldErrors.maxNights}>
              {(props) => <Input {...props} type="number" min={1} value={values.maxNights} onChange={set("maxNights")} />}
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={action.pending}>
              {t("saveBase")}
            </Button>
          </div>
        </form>

        {remove.error ? <Notice tone="danger">{remove.error}</Notice> : null}

        {listSection(
          t("seasons"),
          t("seasonsHint"),
          t("addSeason"),
          () => openSeason(),
          seasons.map((season) => (
            <li key={season.id} className="flex items-center gap-4 px-5 py-3.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{season.name}</p>
                <p className="text-ink-3">
                  {date(season.startDate)} - {date(season.lastDate)}
                  {season.minNights ? `, ${t("minNightsShort", { count: Number(season.minNights) })}` : ""}
                </p>
              </div>
              <p className="tabular text-right">
                {money(season.nightlyPrice)}
                {season.weekendPrice ? <span className="block text-xs text-ink-3">{t("weekendShort", { price: money(season.weekendPrice) })}</span> : null}
              </p>
              {rowActions(() => openSeason(season), () => remove.run(() => deleteSeasonAction(season.id)))}
            </li>
          )),
          t("noSeasons"),
        )}

        {listSection(
          t("specialDates"),
          t("specialDatesHint"),
          t("addSpecialDate"),
          () => openRule("SPECIAL_DATE"),
          rules
            .filter((rule): rule is Extract<RuleRow, { type: "SPECIAL_DATE" }> => rule.type === "SPECIAL_DATE")
            .map((rule) => (
              <li key={rule.id} className="flex items-center gap-4 px-5 py-3.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{rule.name}</p>
                  <p className="text-ink-3">
                    {date(rule.startDate)} - {date(rule.lastDate)}
                  </p>
                </div>
                <p className="tabular">{money(rule.amount)}</p>
                {rowActions(() => openRule(rule.type, rule), () => remove.run(() => deleteRuleAction(rule.id)))}
              </li>
            )),
          t("noSpecialDates"),
        )}

        {listSection(
          t("discounts"),
          t("discountsHint"),
          t("addDiscount"),
          () => openRule("LENGTH_DISCOUNT"),
          rules
            .filter((rule): rule is Extract<RuleRow, { type: "LENGTH_DISCOUNT" }> => rule.type === "LENGTH_DISCOUNT")
            .map((rule) => (
              <li key={rule.id} className="flex items-center gap-4 px-5 py-3.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{rule.name}</p>
                  <p className="text-ink-3">{t("fromNights", { count: Number(rule.minNights) })}</p>
                </div>
                <p className="tabular">-{rule.percent}%</p>
                {rowActions(() => openRule(rule.type, rule), () => remove.run(() => deleteRuleAction(rule.id)))}
              </li>
            )),
          t("noDiscounts"),
        )}

        {listSection(
          t("fees"),
          t("feesHint"),
          t("addFee"),
          () => openRule("FEE"),
          rules
            .filter((rule): rule is Extract<RuleRow, { type: "FEE" }> => rule.type === "FEE")
            .map((rule) => (
              <li key={rule.id} className="flex items-center gap-4 px-5 py-3.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{rule.name}</p>
                  <p className="text-ink-3">{t(`unit.${rule.feeUnit}`)}</p>
                </div>
                <p className="tabular">{money(rule.amount)}</p>
                {rowActions(() => openRule(rule.type, rule), () => remove.run(() => deleteRuleAction(rule.id)))}
              </li>
            )),
          t("noFees"),
        )}
      </div>

      <aside className="h-fit space-y-4 rounded-2xl border border-line bg-surface p-6 xl:sticky xl:top-24">
        <h2 className="font-semibold">{t("simulator")}</h2>
        <p className="text-sm text-ink-3">{t("simulatorHint")}</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("simCheckIn")} className="col-span-3">
            {(props) => <Input {...props} type="date" value={sim.checkIn} onChange={(event) => setSim({ ...sim, checkIn: event.target.value })} />}
          </Field>
          <Field label={t("simNights")}>{(props) => <Input {...props} type="number" min={1} value={sim.nights} onChange={(event) => setSim({ ...sim, nights: event.target.value })} />}</Field>
          <Field label={t("simGuests")}>{(props) => <Input {...props} type="number" min={1} value={sim.guests} onChange={(event) => setSim({ ...sim, guests: event.target.value })} />}</Field>
        </div>
        {simulation?.ok ? (
          <PriceBreakdown quote={simulation.quote} />
        ) : simulation ? (
          <p className="text-sm text-warning-fg">{t(`simError.${simulation.error.code}`)}</p>
        ) : null}
      </aside>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing ? (
          <DialogContent
            title={editing.kind === "season" ? t("seasonDialog") : t(`ruleDialog.${editing.value.type}`)}
            closeLabel={tc("close")}
            footer={
              <>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  {tc("cancel")}
                </Button>
                <Button loading={edit.pending} onClick={saveEditing}>
                  {tc("save")}
                </Button>
              </>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {edit.error ? <Notice tone="danger" className="sm:col-span-2">{edit.error}</Notice> : null}
              <EditorFields editing={editing} setEditing={setEditing} errors={edit.fieldErrors} />
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function EditorFields({ editing, setEditing, errors }: { editing: NonNullable<Editing>; setEditing: (value: Editing) => void; errors: Record<string, string> }) {
  const t = useTranslations("admin.property.pricing");
  const value = editing.value as Record<string, string>;
  const update = (key: string) => (event: { target: { value: string } }) =>
    setEditing({ ...editing, value: { ...editing.value, [key]: event.target.value } } as NonNullable<Editing>);
  const text = (key: string, label: string, props: { type?: string; inputMode?: "decimal" | "numeric"; hint?: string; full?: boolean } = {}) => (
    <Field key={key} label={label} hint={props.hint} error={errors[key]} className={props.full ? "sm:col-span-2" : undefined}>
      {(fieldProps) => <Input {...fieldProps} type={props.type ?? "text"} inputMode={props.inputMode} value={value[key] ?? ""} onChange={update(key)} />}
    </Field>
  );

  if (editing.kind === "season") {
    return (
      <>
        {text("name", t("name"), { full: true })}
        {text("startDate", t("firstNight"), { type: "date" })}
        {text("lastDate", t("lastNight"), { type: "date" })}
        {text("nightlyPrice", t("nightlyPrice"), { inputMode: "decimal" })}
        {text("weekendPrice", t("weekendPrice"), { inputMode: "decimal", hint: t("optional") })}
        {text("minNights", t("minNights"), { type: "number", hint: t("seasonMinHint") })}
      </>
    );
  }
  if (editing.value.type === "SPECIAL_DATE") {
    return (
      <>
        {text("name", t("name"), { full: true })}
        {text("startDate", t("firstNight"), { type: "date" })}
        {text("lastDate", t("lastNight"), { type: "date" })}
        {text("amount", t("nightlyPrice"), { inputMode: "decimal" })}
      </>
    );
  }
  if (editing.value.type === "LENGTH_DISCOUNT") {
    return (
      <>
        {text("name", t("name"), { full: true })}
        {text("minNights", t("discountMinNights"), { type: "number" })}
        {text("percent", t("percent"), { type: "number" })}
      </>
    );
  }
  return (
    <>
      {text("name", t("name"), { full: true })}
      {text("amount", t("amount"), { inputMode: "decimal" })}
      <Field label={t("feeUnit")} error={errors.feeUnit}>
        {(props) => (
          <Select {...props} value={value.feeUnit} onChange={update("feeUnit")}>
            {(["PER_STAY", "PER_NIGHT", "PER_GUEST", "PER_GUEST_NIGHT"] as const).map((unit) => (
              <option key={unit} value={unit}>
                {t(`unit.${unit}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </>
  );
}
