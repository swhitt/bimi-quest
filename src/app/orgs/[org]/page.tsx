import { cache } from "react";
import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { displayIssuerOrg } from "@/lib/ca-display";
import { db } from "@/lib/db";
import { fetchCertificates, type CertificatesResult } from "@/lib/data/certificates";
import { certificates } from "@/lib/db/schema";
import { slugify } from "@/lib/slugify";
import { OrgContent } from "./org-content";

interface Props {
  params: Promise<{ org: string }>;
}

/**
 * Resolve a URL param to an org name.
 * If the param looks like a legacy URL-encoded name (has uppercase or %), slugify and redirect.
 * Otherwise treat it as a slug and resolve via DB lookup.
 */
const resolveOrg = cache(async (rawOrg: string): Promise<string | null> => {
  const decoded = decodeURIComponent(rawOrg);
  const slug = slugify(decoded);

  // If the param isn't already the canonical slug, redirect
  if (rawOrg !== slug) {
    redirect(`/orgs/${slug}`);
  }

  // Look up org name from slug
  const row = await db
    .select({ subjectOrg: certificates.subjectOrg })
    .from(certificates)
    .where(eq(certificates.subjectOrgSlug, slug))
    .limit(1);

  return row[0]?.subjectOrg ?? null;
});

/** Deduplicated initial data fetch shared by generateMetadata and the page component. */
const getOrgCertificates = cache(async (org: string): Promise<CertificatesResult | null> => {
  try {
    const params = new URLSearchParams({ org });
    return await fetchCertificates(params, { page: 1, limit: 50, sort: "notBefore", dir: "desc" });
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org } = await params;
  const orgName = await resolveOrg(org);

  if (!orgName) {
    return { title: "Organization not found" };
  }

  const rows = await db
    .select({
      certType: certificates.certType,
      issuerOrg: certificates.issuerOrg,
      sanList: certificates.sanList,
      fingerprintSha256: certificates.fingerprintSha256,
      notabilityScore: certificates.notabilityScore,
    })
    .from(certificates)
    .where(eq(certificates.subjectOrg, orgName))
    .orderBy(desc(certificates.notBefore))
    .limit(50);

  const certCount = rows.length;
  const types = [...new Set(rows.map((r) => r.certType).filter(Boolean))];
  const issuers = [...new Set(rows.map((r) => (r.issuerOrg ? displayIssuerOrg(r.issuerOrg) : null)).filter(Boolean))];
  const allDomains = [...new Set(rows.flatMap((r) => r.sanList ?? []))];

  const domainsText =
    allDomains.length <= 3
      ? allDomains.join(", ")
      : `${allDomains.slice(0, 3).join(", ")} +${allDomains.length - 3} more`;

  // Pick the best cert for OG image (highest score, then most recent)
  const bestCert = rows.reduce<(typeof rows)[number] | null>((best, r) => {
    if (!best) return r;
    if ((r.notabilityScore ?? 0) > (best.notabilityScore ?? 0)) return r;
    return best;
  }, null);

  const descParts = [
    `${certCount === 50 ? "50+" : certCount} BIMI certificate${certCount !== 1 ? "s" : ""} for ${orgName}`,
    domainsText ? `Domains: ${domainsText}` : "",
    types.length ? `Types: ${types.join(", ")}` : "",
    issuers.length ? `Issued by ${issuers.join(", ")}` : "",
    "Browse on bimi.quest",
  ].filter(Boolean);

  const ogImageUrl = bestCert ? `/api/og/cert/${bestCert.fingerprintSha256.slice(0, 12)}` : undefined;

  return {
    title: `Certificates for ${orgName}`,
    description: descParts.join(" | "),
    openGraph: {
      title: `Certificates for ${orgName}`,
      description: descParts.join(" | "),
      ...(ogImageUrl ? { images: [{ url: ogImageUrl, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `Certificates for ${orgName}`,
      description: descParts.join(" | "),
      ...(ogImageUrl ? { images: [{ url: ogImageUrl, width: 1200, height: 630 }] } : {}),
    },
  };
}

/**
 * Serialize Date fields to ISO strings for the client component.
 * The CertRow type used by the client expects string dates, not Date objects.
 */
function serializeForClient(result: CertificatesResult) {
  return {
    data: result.data.map((row) => ({
      ...row,
      notBefore: row.notBefore instanceof Date ? row.notBefore.toISOString() : row.notBefore,
      notAfter: row.notAfter instanceof Date ? row.notAfter.toISOString() : row.notAfter,
      ctLogTimestamp: row.ctLogTimestamp instanceof Date ? row.ctLogTimestamp.toISOString() : row.ctLogTimestamp,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    })),
    pagination: result.pagination,
  };
}

export default async function OrgPage({ params }: Props) {
  const { org } = await params;
  const orgName = await resolveOrg(org);

  if (!orgName) {
    notFound();
  }

  const result = await getOrgCertificates(orgName);
  const serialized = result ? serializeForClient(result) : null;

  return <OrgContent org={orgName} initialData={serialized?.data} initialPagination={serialized?.pagination} />;
}
