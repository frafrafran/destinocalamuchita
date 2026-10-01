"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toDbDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

interface Colors {
  accent: string;
  accentSoft: string;
  ink: string;
  ink3: string;
  line: string;
  surface: string;
  lineStrong: string;
  chart3: string;
}

/** Reads the theme tokens so charts follow light/dark mode (SVG attributes can't use CSS variables reliably). */
function useThemeColors(): Colors | null {
  const [colors, setColors] = useState<Colors | null>(null);
  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      const v = (name: string) => style.getPropertyValue(name).trim();
      setColors({
        accent: v("--accent"),
        accentSoft: v("--accent-soft"),
        ink: v("--ink"),
        ink3: v("--ink-3"),
        line: v("--line"),
        surface: v("--surface"),
        lineStrong: v("--line-strong"),
        chart3: v("--chart-3"),
      });
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", read);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", read);
    };
  }, []);
  return colors;
}

const tooltipStyle = (colors: Colors) => ({
  background: colors.surface,
  border: `1px solid ${colors.line}`,
  borderRadius: 12,
  fontSize: 12,
  color: colors.ink,
  boxShadow: "0 12px 32px -8px rgb(0 0 0 / 0.2)",
});

export function RevenueChart({ data, currency }: { data: { month: string; revenue: number; bookings: number }[]; currency: "ARS" | "USD" }) {
  const t = useTranslations("admin.dashboard");
  const locale = useLocale();
  const colors = useThemeColors();
  const monthFormat = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const rows = data.map((row) => ({ ...row, label: monthFormat.format(toDbDate(row.month)).replace(".", ""), value: row.revenue / 100 }));
  const total = data.reduce((sum, row) => sum + row.revenue, 0);

  return (
    <figure>
      <figcaption className="sr-only">{t("revenueSummary", { total: formatMoney(total, currency, locale) })}</figcaption>
      <div className="h-64">
        {colors ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={colors.line} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: colors.ink3, fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: colors.ink3, fontSize: 12 }} tickFormatter={(value: number) => compact.format(value)} width={56} />
              <Tooltip
                cursor={{ fill: colors.accentSoft }}
                contentStyle={tooltipStyle(colors)}
                formatter={(value) => [formatMoney(Math.round(Number(value) * 100), currency, locale), t("revenue")]}
                labelStyle={{ color: colors.ink3, marginBottom: 4 }}
              />
              <Bar dataKey="value" fill={colors.accent} radius={[6, 6, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </figure>
  );
}

export function OccupancyChart({ data }: { data: { title: string; occupancy: number }[] }) {
  const t = useTranslations("admin.dashboard");
  const colors = useThemeColors();
  const rows = data.map((row) => ({ ...row, value: Math.round(row.occupancy * 100) }));
  return (
    <figure>
      <figcaption className="sr-only">{rows.map((row) => `${row.title}: ${row.value}%`).join(", ")}</figcaption>
      <div style={{ height: Math.max(rows.length * 44, 120) }}>
        {colors ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis type="category" dataKey="title" width={170} tickLine={false} axisLine={false} tick={{ fill: colors.ink, fontSize: 12 }} />
              <Tooltip cursor={{ fill: colors.accentSoft }} contentStyle={tooltipStyle(colors)} formatter={(value) => [`${value}%`, t("occupancy")]} />
              <Bar
                dataKey="value"
                fill={colors.accent}
                radius={[0, 6, 6, 0]}
                maxBarSize={18}
                background={{ fill: colors.line, radius: 6 }}
                label={{ position: "right", fill: colors.ink3, fontSize: 12, formatter: (value: unknown) => `${value}%` }}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </figure>
  );
}

export function SourcesChart({ data }: { data: { key: string; label: string; value: number }[] }) {
  const t = useTranslations("admin.dashboard");
  const colors = useThemeColors();
  const total = data.reduce((sum, row) => sum + row.value, 0);
  const palette = colors ? [colors.accent, colors.ink3, colors.chart3, colors.lineStrong] : [];
  return (
    <figure className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative size-44 shrink-0">
        {colors && total > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="label" innerRadius="68%" outerRadius="100%" stroke={colors.surface} strokeWidth={3} paddingAngle={1}>
                {data.map((row, index) => (
                  <Cell key={row.key} fill={palette[index % palette.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle(colors)} />
            </PieChart>
          </ResponsiveContainer>
        ) : null}
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="tabular text-2xl font-semibold">{total}</p>
            <p className="text-xs text-ink-3">{t("bookingsLabel")}</p>
          </div>
        </div>
      </div>
      <figcaption className="w-full">
        <ul className="space-y-2.5 text-sm">
          {data.map((row, index) => (
            <li key={row.key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2.5">
                <span aria-hidden className="size-2.5 rounded-sm" style={{ background: palette[index % palette.length] }} />
                {row.label}
              </span>
              <span className="tabular text-ink-3">
                {row.value} ({total ? Math.round((row.value / total) * 100) : 0}%)
              </span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
