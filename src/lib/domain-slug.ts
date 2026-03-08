/** Known second-level TLDs where the registrable name is the third segment */
const SECOND_LEVEL_TLDS = new Set([
  "co.uk",
  "org.uk",
  "me.uk",
  "ac.uk",
  "co.jp",
  "or.jp",
  "ne.jp",
  "com.au",
  "net.au",
  "org.au",
  "com.br",
  "org.br",
  "net.br",
  "co.nz",
  "net.nz",
  "org.nz",
  "co.za",
  "org.za",
  "web.za",
  "co.in",
  "net.in",
  "org.in",
  "co.kr",
  "or.kr",
  "com.mx",
  "org.mx",
  "com.cn",
  "net.cn",
  "org.cn",
  "com.tw",
  "org.tw",
  "com.sg",
  "org.sg",
  "co.il",
  "com.ar",
  "org.ar",
  "co.th",
  "or.th",
]);

/** Extract a short slug from a domain for URL-friendly paths.
 *  Returns the registrable name portion (e.g. "google" from "mail.google.com",
 *  "bbc" from "www.bbc.co.uk"). */
export function domainSlug(domain: string): string {
  const clean = domain
    .replace(/^\*\./, "")
    .replace(/^www\./, "")
    .toLowerCase();
  const parts = clean.split(".");
  if (parts.length <= 1) return parts[0] || "logo";

  // Check for known second-level TLDs (e.g. co.uk, com.au)
  if (parts.length >= 3) {
    const lastTwo = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
    if (SECOND_LEVEL_TLDS.has(lastTwo)) {
      return parts[parts.length - 3] || "logo";
    }
  }

  // Default: registrable name is the second-to-last segment
  return parts[parts.length - 2] || "logo";
}
