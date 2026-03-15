import { slugify } from "@/lib/slugify";

export const orgUrl = (org: string) => `/orgs/${slugify(org)}`;
export const certUrl = (fp: string) => `/certificates/${fp.slice(0, 12)}`;
export const domainUrl = (d: string) => `/domains/${encodeURIComponent(d)}`;
export const logoUrl = (fp: string) => `/logos/${fp.slice(0, 16)}`;
export const checkUrl = (q: string) => `/check?q=${encodeURIComponent(q)}`;
export const caUrl = (rootCaOrg: string, issuerOrg?: string) => {
  const base = `/cas/${slugify(rootCaOrg)}`;
  return issuerOrg ? `${base}?intermediate=${slugify(issuerOrg)}` : base;
};

/** @deprecated Use `checkUrl` instead. */
export const validateUrl = checkUrl;
