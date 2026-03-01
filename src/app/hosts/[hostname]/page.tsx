import type { Metadata } from "next";
import { Suspense } from "react";
import { sql, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { HostContent } from "./host-content";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  params: Promise<{ hostname: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hostname } = await params;
  const decoded = decodeURIComponent(hostname).toLowerCase();

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

export default async function HostPage({ params }: Props) {
  const { hostname } = await params;
  const decoded = decodeURIComponent(hostname).toLowerCase().replace(/\.$/, "");
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-[500px] w-full rounded-xl" />
        </div>
      }
    >
      <HostContent hostname={decoded} />
    </Suspense>
  );
}
