import { WarningIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader, Panel, Table, Td, Th, Tr } from "@/components/admin/ui";
import { FilterBar, FilterTabs, Pagination } from "@/components/admin/url-filters";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import type { ProofStatus } from "@/generated/prisma/enums";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { formatMoney, toCents } from "@/lib/money";
import { PROOF_STATUS_TONE } from "@/lib/reservation-status";
import { requirePageUser } from "@/server/auth/guard";
import { listProofs } from "@/server/queries/directory";

const STATUSES: ProofStatus[] = ["PENDING_REVIEW", "APPROVED", "RESUBMISSION_REQUESTED", "REJECTED"];

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/pagos">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.nav" });
  return { title: t("payments") };
}

export default async function PaymentsPage({ params, searchParams }: PageProps<"/[locale]/admin/pagos">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  await requirePageUser("payments:read");
  const query = await searchParams;
  const status = query.status === "ALL" ? "ALL" : STATUSES.includes(query.status as ProofStatus) ? (query.status as ProofStatus) : "PENDING_REVIEW";
  const page = Number(query.page) || 1;
  const [t, tStatus, data] = await Promise.all([getTranslations("admin.payments"), getTranslations("status"), listProofs(status, page)]);
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", hourCycle: locale === "en" ? "h12" : "h23", timeZone: "America/Argentina/Cordoba" });

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <FilterBar>
        <FilterTabs
          name="status"
          options={[
            { value: "", label: tStatus("proof.PENDING_REVIEW"), count: data.counts.PENDING_REVIEW ?? 0 },
            ...STATUSES.slice(1).map((s) => ({ value: s, label: tStatus(`proof.${s}`), count: data.counts[s] ?? 0 })),
            { value: "ALL", label: t("all") },
          ]}
        />
      </FilterBar>
      <Panel padded={false}>
        {data.items.length ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t("table.uploaded")}</Th>
                  <Th>{t("table.reservation")}</Th>
                  <Th>{t("table.guest")}</Th>
                  <Th className="text-right">{t("table.due")}</Th>
                  <Th className="text-right">{t("table.declared")}</Th>
                  <Th>{t("table.status")}</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((proof) => {
                  const reservation = proof.payment.reservation;
                  const due = toCents(proof.payment.amountDue);
                  const declared = proof.declaredAmount === null ? null : toCents(proof.declaredAmount);
                  const duplicate = data.duplicates.get(proof.id);
                  return (
                    <Tr key={proof.id}>
                      <Td className="whitespace-nowrap text-ink-2">{dateTime.format(proof.uploadedAt)}</Td>
                      <Td>
                        <Link href={`/admin/reservas/${reservation.id}`} className="tabular font-medium text-accent-text hover:underline">
                          {reservation.code}
                        </Link>
                        <p className="text-xs text-ink-3">{reservation.property.title}</p>
                      </Td>
                      <Td>
                        {reservation.guest.firstName} {reservation.guest.lastName}
                      </Td>
                      <Td className="tabular text-right">{formatMoney(due, proof.payment.currency, locale)}</Td>
                      <Td className="tabular text-right">
                        {declared === null ? <span className="text-ink-3">-</span> : <span className={declared !== due ? "text-warning-fg" : undefined}>{formatMoney(declared, proof.payment.currency, locale)}</span>}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Badge tone={PROOF_STATUS_TONE[proof.status]}>{tStatus(`proof.${proof.status}`)}</Badge>
                          {duplicate ? (
                            <span className="text-danger-fg" title={t("duplicate", { codes: duplicate.map((d) => d.code).join(", ") })} aria-label={t("duplicate", { codes: duplicate.map((d) => d.code).join(", ") })}>
                              <WarningIcon size={16} weight="fill" />
                            </span>
                          ) : null}
                        </div>
                        {proof.reviewedBy ? <p className="mt-1 text-xs text-ink-3">{proof.reviewedBy.name}</p> : null}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination page={page} pages={data.pages} labels={{ previous: t("previous"), next: t("next"), summary: t("summary", { total: data.total }) }} />
          </>
        ) : (
          <div className="p-6">
            <EmptyState title={t("empty")} description={t("emptyHint")} />
          </div>
        )}
      </Panel>
    </>
  );
}
