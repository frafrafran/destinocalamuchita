import "server-only";
import type { AbstractIntlMessages } from "next-intl";
import { getMessages } from "next-intl/server";

/** Namespaces client components on the public site need; everything else stays on the server. */
export const PUBLIC_CLIENT_NAMESPACES = [
  "common",
  "nav",
  "search",
  "calendar",
  "property",
  "booking",
  "reservation",
  "status",
  "validation",
  "errors",
  "quoteErrors",
  "amenities",
  "propertyTypes",
] as const;

export async function pickMessages(namespaces: readonly string[]): Promise<AbstractIntlMessages> {
  const messages = await getMessages();
  return Object.fromEntries(namespaces.filter((ns) => ns in messages).map((ns) => [ns, messages[ns]!])) as AbstractIntlMessages;
}
