import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

/** /admin, /en/admin, /pt/admin (and sub-paths). */
const ADMIN_PATH = /^\/(?:(en|pt)\/)?admin(?:\/|$)/;

/**
 * Locale routing for every page, plus an optimistic redirect to the login page when an admin URL
 * is requested without a session cookie. The real authorization check happens on the server for
 * every admin page and action (src/server/auth/guard.ts); this only avoids rendering work.
 */
export default function proxy(request: NextRequest) {
  const match = ADMIN_PATH.exec(request.nextUrl.pathname);
  if (match && !request.cookies.has("rm_session")) {
    const url = new URL(`${match[1] ? `/${match[1]}` : ""}/login`, request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return intl(request);
}

export const config = {
  // Everything except API routes, stored media, Next internals and files with an extension.
  matcher: ["/((?!api|media|_next|_vercel|.*\\..*).*)"],
};
