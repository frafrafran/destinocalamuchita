import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader, Panel, Table, Td, Th, Tr } from "@/components/admin/ui";
import { FilterBar, FilterSearch, Pagination } from "@/components/admin/url-filters";
import { EmptyState } from "@/components/ui/feedback";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { requirePageUser } from "@/server/auth/guard";
import { listGuests } from "@/server/queries/directory";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/huespedes">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.nav" });
  return { title: t("guests") };
}

export default async function GuestsPage({ params, searchParams }: PageProps<"/[locale]/admin/huespedes">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  await requirePageUser("guests:read");
  const query = await searchParams;
  const page = Number(query.page) || 1;
  const [t, data] = await Promise.all([getTranslations("admin.guests"), listGuests(typeof query.q === "string" ? query.q.slice(0, 80) : undefined, page)]);
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle", { count: data.total })} />
      <FilterBar>
        <FilterSearch placeholder={t("search")} />
      </FilterBar>
      <Panel padded={false}>
        {data.items.length ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t("table.name")}</Th>
                  <Th>{t("table.contact")}</Th>
                  <Th>{t("table.country")}</Th>
                  <Th className="text-right">{t("table.stays")}</Th>
                  <Th>{t("table.last")}</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((guest) => (
                  <Tr key={guest.id}>
                    <Td>
                      <Link href={`/admin/huespedes/${guest.id}`} className="font-medium text-accent-text hover:underline">
                        {guest.firstName} {guest.lastName}
                      </Link>
                    </Td>
                    <Td>
                      <p>{guest.email}</p>
                      <p className="text-xs text-ink-3">{guest.phone}</p>
                    </Td>
                    <Td className="text-ink-2">{guest.country ?? "-"}</Td>
                    <Td className="tabular text-right">{guest._count.reservations}</Td>
                    <Td className="text-ink-2">
                      {guest.reservations[0] ? (
                        <>
                          <p>{day.format(guest.reservations[0].checkIn)}</p>
                          <p className="text-xs text-ink-3">{guest.reservations[0].property.title}</p>
                        </>
                      ) : (
                        "-"
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pages={data.pages} labels={{ previous: t("previous"), next: t("next"), summary: t("summary", { total: data.total }) }} />
          </>
        ) : (
          <div className="p-6">
            <EmptyState title={t("empty")} />
          </div>
        )}
      </Panel>
    </>
  );
}
