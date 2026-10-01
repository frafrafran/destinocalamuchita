"use client";

import { useTranslations } from "next-intl";
import { AmenityIcon } from "@/components/amenity-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

export interface AmenityGroup {
  category: string;
  label: string;
  items: { key: string; label: string; icon: string }[];
}

export function AmenitiesDialog({ groups, total }: { groups: AmenityGroup[]; total: number }) {
  const t = useTranslations("property");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="mt-8">
          {t("showAllAmenities", { count: total })}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("amenitiesTitle")} closeLabel={t("close")}>
        <div className="space-y-8 pb-2">
          {groups.map((group) => (
            <section key={group.category}>
              <h3 className="text-sm font-semibold">{group.label}</h3>
              <ul className="mt-3 divide-y divide-line">
                {group.items.map((item) => (
                  <li key={item.key} className="flex items-center gap-4 py-3 text-ink-2">
                    <AmenityIcon name={item.icon} size={22} className="text-ink" />
                    {item.label}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
