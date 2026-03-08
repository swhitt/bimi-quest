import { slugify } from "@/lib/slugify";

export const orgUrl = (org: string) => `/orgs/${slugify(org)}`;
export const certUrl = (fp: string) => `/certificates/${fp.slice(0, 12)}`;
export const hostUrl = (h: string) => `/hosts/${encodeURIComponent(h)}`;
export const logoUrl = (fp: string) => `/logo/${fp.slice(0, 16)}`;
export const validateUrl = (q: string) => `/validate?q=${encodeURIComponent(q)}`;
export const domainUrl = (d: string) => `/domains/${encodeURIComponent(d)}`;
