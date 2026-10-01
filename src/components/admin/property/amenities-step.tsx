"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { createAmenityAction, setAmenitiesAction } from "@/actions/properties";
import { AMENITY_ICONS, AmenityIcon } from "@/components/amenity-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useAction } from "../use-action";

interface Amenity {
  id: string;
  key: string;
  label: string;
  icon: string;
  category: string;
}

const CATEGORIES = ["essentials", "kitchen", "comfort", "outdoor", "services", "family", "safety", "general"] as const;

export function AmenitiesStep({ propertyId, amenities, selected }: { propertyId: string; amenities: Amenity[]; selected: string[] }) {
  const t = useTranslations("admin.property.amenities");
  const tA = useTranslations("amenities");
  const tc = useTranslations("common");
  const action = useAction();
  const create = useAction();
  const [chosen, setChosen] = useState(new Set(selected));
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ label: "", icon: "Sparkle", category: "general" as (typeof CATEGORIES)[number] });
  const label = (amenity: Amenity) => (tA.has(amenity.key) ? tA(amenity.key) : amenity.label);
  const dirty = chosen.size !== selected.length || selected.some((id) => !chosen.has(id));

  return (
    <div className="space-y-6">
      {action.error ? <Notice tone="danger">{action.error}</Notice> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-3">{t("selected", { count: chosen.size })}</p>
        <div className="flex gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary">
                <PlusIcon size={15} />
                {t("custom")}
              </Button>
            </DialogTrigger>
            <DialogContent
              title={t("customTitle")}
              description={t("customHint")}
              closeLabel={tc("close")}
              footer={
                <Button
                  loading={create.pending}
                  onClick={() =>
                    create.run(() => createAmenityAction(draft), {
                      onSuccess: ({ id }) => {
                        setChosen((current) => new Set(current).add(id));
                        setOpen(false);
                        setDraft({ label: "", icon: "Sparkle", category: "general" });
                      },
                    })
                  }
                >
                  {t("createCustom")}
                </Button>
              }
            >
              <div className="space-y-4">
                {create.error ? <Notice tone="danger">{create.error}</Notice> : null}
                <Field label={t("customLabel")} error={create.fieldErrors.label}>
                  {(props) => <Input {...props} value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} maxLength={60} />}
                </Field>
                <Field label={t("customCategory")}>
                  {(props) => (
                    <Select {...props} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as (typeof CATEGORIES)[number] })}>
                      {CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {tA(`categories.${category}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <fieldset>
                  <legend className="text-[13px] font-medium text-ink-2">{t("customIcon")}</legend>
                  <div className="mt-2 grid grid-cols-8 gap-1.5">
                    {Object.keys(AMENITY_ICONS).map((name) => (
                      <button
                        key={name}
                        type="button"
                        aria-pressed={draft.icon === name}
                        aria-label={name}
                        onClick={() => setDraft({ ...draft, icon: name })}
                        className={cn("grid aspect-square place-items-center rounded-lg border transition-colors", draft.icon === name ? "border-accent bg-accent-soft text-accent-text" : "border-line hover:bg-surface-2")}
                      >
                        <AmenityIcon name={name} size={18} />
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            </DialogContent>
          </Dialog>
          <Button disabled={!dirty} loading={action.pending} onClick={() => action.run(() => setAmenitiesAction(propertyId, [...chosen]))}>
            {t("save")}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {CATEGORIES.filter((category) => amenities.some((a) => a.category === category)).map((category) => (
          <fieldset key={category} className="rounded-2xl border border-line bg-surface p-5">
            <legend className="px-1 text-sm font-semibold">{tA(`categories.${category}`)}</legend>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {amenities
                .filter((amenity) => amenity.category === category)
                .map((amenity) => {
                  const checked = chosen.has(amenity.id);
                  return (
                    <label key={amenity.id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors", checked ? "bg-accent-soft" : "hover:bg-surface-2")}>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) =>
                          setChosen((current) => {
                            const next = new Set(current);
                            if (value === true) next.add(amenity.id);
                            else next.delete(amenity.id);
                            return next;
                          })
                        }
                      />
                      <AmenityIcon name={amenity.icon} size={18} className="text-ink-2" />
                      {label(amenity)}
                    </label>
                  );
                })}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
