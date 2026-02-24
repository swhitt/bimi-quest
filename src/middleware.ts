import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// CA slug -> root_ca_org value used for filtering.
// Clicking "SSL.com" will match both SSL Corporation and Sectigo certs.
const CA_SLUGS: Record<string, string> = {
  digicert: "DigiCert",
  entrust: "Entrust",
  globalsign: "GlobalSign",
  sslcom: "SSL Corporation",
  sectigo: "Sectigo Limited",
};

// Rewrites /ca/digicert/certificates -> /certificates?ca=DigiCert
// The browser URL stays pretty, the page code reads query params as usual.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/ca/")) return NextResponse.next();

  const segments = pathname.split("/").filter(Boolean);
  // segments: ["ca", "digicert"] or ["ca", "digicert", "certificates"]
  if (segments.length < 2) return NextResponse.next();

  const caSlug = segments[1].toLowerCase();
  const caName = CA_SLUGS[caSlug];
  if (!caName) return NextResponse.next();

  // The rest of the path after /ca/slug/
  const rest = "/" + segments.slice(2).join("/");
  const target = rest === "/" ? "/" : rest;

  const url = request.nextUrl.clone();
  url.pathname = target;
  url.searchParams.set("ca", caName);

  return NextResponse.rewrite(url);
}

export const config = {
  matcher: "/ca/:path*",
};
