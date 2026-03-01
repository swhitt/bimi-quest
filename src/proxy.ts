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

const isDev = process.env.NODE_ENV === "development";

/**
 * Proxy handles URL rewrites, request ID injection, and CSP nonce generation.
 *
 * URL rewrites:
 *  1. /certificates/ca/digicert -> /certificates?ca=DigiCert
 *  2. /logos/page/3             -> /logos?page=3
 * Both can combine: /certificates/ca/digicert/page/2 -> /certificates?ca=DigiCert&page=2
 *
 * CSP: generates a per-request nonce and sets it in the Content-Security-Policy
 * header. Next.js reads the header, extracts the nonce, and applies it to all
 * framework scripts automatically. Pages must be dynamically rendered for this
 * to work (see Next.js CSP docs).
 */
export function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

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

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("Content-Security-Policy", csp);

  if (modified) {
    url.pathname = pathname;
    const response = NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    });
    response.headers.set("Content-Security-Policy", csp);
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
