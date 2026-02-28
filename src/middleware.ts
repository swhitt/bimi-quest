import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// CA slug -> issuer_org value used for filtering.
const CA_SLUGS: Record<string, string> = {
  digicert: "DigiCert",
  entrust: "Entrust",
  globalsign: "GlobalSign nv-sa",
  sslcom: "SSL Corporation",
  sectigo: "Sectigo Limited",
};

/**
 * Middleware handles two URL rewrites:
 *  1. /certificates/ca/digicert -> /certificates?ca=DigiCert
 *  2. /logos/page/3             -> /logos?page=3
 * Both can combine: /certificates/ca/digicert/page/2 -> /certificates?ca=DigiCert&page=2
 */
export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  let { pathname } = url;
  let modified = false;

  // Extract /page/N suffix from any route
  const pageMatch = pathname.match(/\/page\/(\d+)$/);
  if (pageMatch) {
    url.searchParams.set("page", pageMatch[1]);
    pathname = pathname.replace(/\/page\/\d+$/, "") || "/";
    modified = true;
  }

  // Handle /ca/slug suffix on any route: /{route}/ca/{slug} -> /{route}?ca=Name
  const caMatch = pathname.match(/^(.*)\/ca\/([^/]+)$/);
  if (caMatch) {
    const basePath = caMatch[1] || "/";
    const caSlug = caMatch[2].toLowerCase();
    const caName = CA_SLUGS[caSlug];
    if (caName) {
      pathname = basePath === "" ? "/" : basePath;
      url.searchParams.set("ca", caName);
      modified = true;
    }
  }

  if (!modified) return NextResponse.next();

  url.pathname = pathname;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon).*)"],
};
