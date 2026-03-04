import { cache } from "react";
import { desc, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { fetchCertificates, type CertificatesResult } from "@/lib/data/certificates";
import { certificates } from "@/lib/db/schema";
import { HostContent } from "./host-content";

interface Props {
  params: Promise<{ hostname: string }>;
}

/** Deduplicated hostname resolution shared by generateMetadata and the page component. */
const resolveHostname = cache(async (rawHostname: string) => {
  return decodeURIComponent(rawHostname).toLowerCase().replace(/\.$/, "");
});

/** Deduplicated initial data fetch shared by generateMetadata and the page component. */
const getHostCertificates = cache(async (hostname: string): Promise<CertificatesResult | null> => {
  try {
    const params = new URLSearchParams({ host: hostname });
    return await fetchCertificates(params, { page: 1, limit: 50, sort: "notBefore", dir: "desc" });
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hostname } = await params;
  const decoded = await resolveHostname(hostname);

  const rows = await db
    .select({
      subjectOrg: certificates.subjectOrg,
      certType: certificates.certType,
    })
    .from(certificates)
    .where(sql`${decoded} = ANY(${certificates.sanList})`)
    .orderBy(desc(certificates.notBefore))
    .limit(50);

  const certCount = rows.length;
  const orgs = [...new Set(rows.map((r) => r.subjectOrg).filter(Boolean))];
  const types = [...new Set(rows.map((r) => r.certType).filter(Boolean))];
  const typeCounts = types.map((t) => `${rows.filter((r) => r.certType === t).length} ${t}`).join(", ");

  const descParts = [
    `${certCount === 50 ? "50+" : certCount} BIMI certificate${certCount !== 1 ? "s" : ""} with ${decoded} as SAN`,
    orgs.length
      ? `Organizations: ${orgs.slice(0, 3).join(", ")}${orgs.length > 3 ? ` +${orgs.length - 3} more` : ""}`
      : "",
    typeCounts ? `Types: ${typeCounts}` : "",
    "Browse on bimi.quest",
  ].filter(Boolean);

  const ogImageUrl = `/api/og/host/${encodeURIComponent(decoded)}`;

  return {
    title: `Certificates for ${decoded}`,
    description: descParts.join(" | "),
    openGraph: {
      title: `Certificates for ${decoded}`,
      description: descParts.join(" | "),
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `Certificates for ${decoded}`,
      description: descParts.join(" | "),
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
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

export default async function HostPage({ params }: Props) {
  const { hostname } = await params;
  const decoded = await resolveHostname(hostname);

  const result = await getHostCertificates(decoded);
  const serialized = result ? serializeForClient(result) : null;

  return <HostContent hostname={decoded} initialData={serialized?.data} initialPagination={serialized?.pagination} />;
}
