import type { Metadata } from "next";
import { Suspense } from "react";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { displayIssuerOrg } from "@/lib/ca-display";
import { OrgContent } from "./org-content";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  params: Promise<{ org: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org } = await params;
  const decoded = decodeURIComponent(org);

  const rows = await db
    .select({
      certType: certificates.certType,
      issuerOrg: certificates.issuerOrg,
      sanList: certificates.sanList,
      fingerprintSha256: certificates.fingerprintSha256,
      notabilityScore: certificates.notabilityScore,
    })
    .from(certificates)
    .where(eq(certificates.subjectOrg, decoded))
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
    `${certCount === 50 ? "50+" : certCount} BIMI certificate${certCount !== 1 ? "s" : ""} for ${decoded}`,
    domainsText ? `Domains: ${domainsText}` : "",
    types.length ? `Types: ${types.join(", ")}` : "",
    issuers.length ? `Issued by ${issuers.join(", ")}` : "",
    "Browse on bimi.quest",
  ].filter(Boolean);

  const ogImageUrl = bestCert ? `/api/og/cert/${bestCert.fingerprintSha256.slice(0, 12)}` : undefined;

  return {
    title: `Certificates for ${decoded}`,
    description: descParts.join(" | "),
    openGraph: {
      title: `Certificates for ${decoded}`,
      description: descParts.join(" | "),
      ...(ogImageUrl ? { images: [{ url: ogImageUrl, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `Certificates for ${decoded}`,
      description: descParts.join(" | "),
      ...(ogImageUrl ? { images: [{ url: ogImageUrl, width: 1200, height: 630 }] } : {}),
    },
  };
}

export default async function OrgPage({ params }: Props) {
  const { org } = await params;
  const decoded = decodeURIComponent(org);
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-[500px] w-full rounded-xl" />
        </div>
      }
    >
      <OrgContent org={decoded} />
    </Suspense>
  );
}
