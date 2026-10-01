import "server-only";
import { createTranslator } from "next-intl";
import type { Currency } from "@/generated/prisma/enums";
import { type Locale, LOCALE_TAGS, toLocale } from "@/i18n/config";
import { toDbDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import pt from "../../../messages/pt.json";

const MESSAGES = { es, en, pt } as const;

export const GUEST_TEMPLATES = [
  "RESERVATION_REQUESTED",
  "PROOF_RECEIVED",
  "RESERVATION_CONFIRMED",
  "PROOF_REJECTED",
  "RESERVATION_REJECTED",
  "RESERVATION_CANCELLED",
  "RESERVATION_EXPIRED",
  "DATES_CHANGED",
  "CHECKIN_REMINDER",
  "POST_STAY",
  "ACCESS_LINK",
] as const;

export const STAFF_TEMPLATES = [
  "ADMIN_NEW_RESERVATION",
  "ADMIN_NEW_PROOF",
  "ADMIN_CALENDAR_CONFLICT",
  "ADMIN_SYNC_FAILING",
] as const;

export type GuestTemplate = (typeof GUEST_TEMPLATES)[number];
export type StaffTemplate = (typeof STAFF_TEMPLATES)[number];
export type NotificationTemplate = GuestTemplate | StaffTemplate;

export interface BankDetails {
  bankName: string;
  accountHolder: string;
  cbu: string;
  alias: string;
  accountTaxId: string;
}

/** Snapshot of everything a message needs, stored with the notification (outbox pattern). */
export interface NotificationPayload {
  code?: string;
  reservationId?: string;
  propertyTitle?: string;
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  guests?: number;
  total?: number;
  currency?: Currency;
  guestName?: string;
  link?: string;
  note?: string | null;
  deadline?: string | null;
  bank?: BankDetails;
  address?: string;
  arrival?: string;
  checkInTime?: string;
  checkOutTime?: string;
  channel?: string;
  error?: string;
  declaredAmount?: number | null;
}

type Section = "details" | "bank" | "note" | "arrival";

const SECTIONS: Record<NotificationTemplate, Section[]> = {
  RESERVATION_REQUESTED: ["details", "bank"],
  PROOF_RECEIVED: ["details"],
  RESERVATION_CONFIRMED: ["details", "arrival"],
  PROOF_REJECTED: ["note", "bank"],
  RESERVATION_REJECTED: ["note", "details"],
  RESERVATION_CANCELLED: ["note", "details"],
  RESERVATION_EXPIRED: ["details"],
  DATES_CHANGED: ["details"],
  CHECKIN_REMINDER: ["details", "arrival"],
  POST_STAY: [],
  ACCESS_LINK: ["details"],
  ADMIN_NEW_RESERVATION: ["details"],
  ADMIN_NEW_PROOF: ["details"],
  ADMIN_CALENDAR_CONFLICT: ["details"],
  ADMIN_SYNC_FAILING: ["note"],
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDay(locale: Locale, iso: string): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "full", timeZone: "UTC" }).format(toDbDate(iso));
}

function formatDeadline(locale: Locale, iso: string): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    dateStyle: "long",
    timeStyle: "short",
    hourCycle: locale === "en" ? "h12" : "h23",
    timeZone: "America/Argentina/Cordoba",
  }).format(new Date(iso));
}

export interface RenderedMessage {
  subject: string;
  title: string;
  html: string;
  text: string;
}

export function renderNotification(
  template: NotificationTemplate,
  rawLocale: string,
  payload: NotificationPayload,
  agencyName: string,
): RenderedMessage {
  const locale = toLocale(rawLocale);
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "emails" });
  const params = {
    code: payload.code ?? "",
    property: payload.propertyTitle ?? "",
    agency: agencyName,
    channel: payload.channel ?? "",
    deadline: payload.deadline ? formatDeadline(locale, payload.deadline) : "",
    date: payload.checkIn ? formatDay(locale, payload.checkIn) : "",
  };

  const subject = t(`${template}.subject`, params);
  const title = t(`${template}.title`, params);
  const intro = t(`${template}.intro`, params);

  const rows: [string, string][] = [];
  const blocks: { html: string; text: string }[] = [];

  for (const section of SECTIONS[template]) {
    if (section === "details" && payload.code) {
      rows.push([t("labels.code"), payload.code]);
      if (payload.propertyTitle) rows.push([t("labels.property"), payload.propertyTitle]);
      if (payload.checkIn && payload.checkOut) {
        rows.push([t("labels.checkIn"), `${formatDay(locale, payload.checkIn)}${payload.checkInTime ? ` · ${payload.checkInTime}` : ""}`]);
        rows.push([t("labels.checkOut"), `${formatDay(locale, payload.checkOut)}${payload.checkOutTime ? ` · ${payload.checkOutTime}` : ""}`]);
      }
      if (payload.guests) rows.push([t("labels.guests"), String(payload.guests)]);
      if (payload.total !== undefined && payload.currency) rows.push([t("labels.total"), formatMoney(payload.total, payload.currency, locale)]);
      if (payload.guestName && template.startsWith("ADMIN_")) rows.push([t("labels.guest"), payload.guestName]);
      if (payload.declaredAmount && payload.currency) {
        rows.push([t("labels.declaredAmount"), formatMoney(payload.declaredAmount, payload.currency, locale)]);
      }
    }
    if (section === "bank" && payload.bank) {
      const bank = payload.bank;
      const bankRows: [string, string][] = [
        [t("labels.bank"), bank.bankName],
        [t("labels.holder"), bank.accountHolder],
        [t("labels.cbu"), bank.cbu],
        [t("labels.alias"), bank.alias],
        [t("labels.taxId"), bank.accountTaxId],
      ];
      if (payload.total !== undefined && payload.currency) bankRows.push([t("labels.amount"), formatMoney(payload.total, payload.currency, locale)]);
      if (payload.deadline) bankRows.push([t("labels.deadline"), formatDeadline(locale, payload.deadline)]);
      const filled = bankRows.filter(([, value]) => value);
      blocks.push({
        html: `<h2 style="font-size:15px;margin:28px 0 8px;color:#121815">${escapeHtml(t("transferTitle"))}</h2>${table(filled)}`,
        text: `\n${t("transferTitle")}\n${filled.map(([k, v]) => `${k}: ${v}`).join("\n")}`,
      });
    }
    if (section === "note" && (payload.note || payload.error)) {
      const note = payload.note ?? payload.error ?? "";
      blocks.push({
        html: `<div style="margin:20px 0;padding:14px 16px;border-radius:12px;background:#f1f4f2;color:#27302b;white-space:pre-line">${escapeHtml(note)}</div>`,
        text: `\n${note}\n`,
      });
    }
    if (section === "arrival" && payload.arrival) {
      blocks.push({
        html: `<h2 style="font-size:15px;margin:28px 0 8px;color:#121815">${escapeHtml(t("arrivalTitle"))}</h2>${
          payload.address ? `<p style="margin:0 0 8px;color:#27302b">${escapeHtml(payload.address)}</p>` : ""
        }<p style="margin:0;color:#27302b;white-space:pre-line">${escapeHtml(payload.arrival)}</p>`,
        text: `\n${t("arrivalTitle")}\n${payload.address ?? ""}\n${payload.arrival}\n`,
      });
    }
  }

  const greeting = payload.guestName && !template.startsWith("ADMIN_") ? t("greeting", { name: payload.guestName.split(" ")[0]! }) : "";
  const cta = payload.link ? { label: template.startsWith("ADMIN_") ? t("openInAdmin") : t("viewReservation"), url: payload.link } : null;

  const html = layout({
    agencyName,
    preheader: intro,
    body: [
      `<h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;color:#121815;letter-spacing:-0.01em">${escapeHtml(title)}</h1>`,
      greeting ? `<p style="margin:0 0 12px;color:#27302b">${escapeHtml(greeting)}</p>` : "",
      `<p style="margin:0 0 20px;color:#27302b;line-height:1.6">${escapeHtml(intro)}</p>`,
      rows.length ? table(rows) : "",
      ...blocks.map((block) => block.html),
      cta
        ? `<p style="margin:32px 0 8px"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#1f4d3d;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">${escapeHtml(cta.label)}</a></p>`
        : "",
      `<p style="margin:28px 0 0;color:#5a635e">${escapeHtml(t("signature", { agency: agencyName }))}</p>`,
    ].join(""),
    footer: t("footer", { agency: agencyName }),
  });

  const text = [
    title,
    "",
    greeting,
    intro,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...blocks.map((block) => block.text),
    cta ? `\n${cta.label}: ${cta.url}` : "",
    "",
    t("signature", { agency: agencyName }),
  ]
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n");

  return { subject, title, html, text };
}

function table(rows: [string, string][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e3e7e4;border-radius:12px">${rows
    .map(
      ([label, value], index) =>
        `<tr><td style="padding:10px 14px;color:#5a635e;font-size:13px;${index ? "border-top:1px solid #e3e7e4;" : ""}width:40%">${escapeHtml(label)}</td><td style="padding:10px 14px;color:#121815;font-size:14px;font-weight:600;${index ? "border-top:1px solid #e3e7e4;" : ""}">${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table>`;
}

function layout({ agencyName, preheader, body, footer }: { agencyName: string; preheader: string; body: string; footer: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(agencyName)}</title></head>
<body style="margin:0;background:#f4f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 20px;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:#1f4d3d">${escapeHtml(agencyName)}</td></tr>
<tr><td style="background:#ffffff;border-radius:18px;padding:32px 28px;border:1px solid #e3e7e4">${body}</td></tr>
<tr><td style="padding:20px 4px;color:#7a837e;font-size:12px;line-height:1.5">${escapeHtml(footer)}</td></tr>
</table></td></tr></table></body></html>`;
}
