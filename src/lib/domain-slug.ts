import { getDomainWithoutSuffix } from "tldts";

/** Extract a short slug from a domain for URL-friendly paths */
export function domainSlug(domain: string): string {
  const clean = domain.replace(/^\*\./, "").replace(/^www\./, "").toLowerCase();
  const name = getDomainWithoutSuffix(clean);
  return name || clean.split(".")[0] || "logo";
}
