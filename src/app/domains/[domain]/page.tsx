import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { domainBimiState } from "@/lib/db/schema";
import { DomainDetail } from "./domain-detail";

interface Props {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ fresh?: string }>;
}

const resolveDomain = cache(async (raw: string) => {
  return decodeURIComponent(raw).toLowerCase().replace(/\.$/, "");
});

const getDomainData = cache(async (domain: string) => {
  const rows = await db.select().from(domainBimiState).where(eq(domainBimiState.domain, domain)).limit(1);
  return rows[0] ?? null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain: rawDomain } = await params;
  const domain = await resolveDomain(rawDomain);
  const row = await getDomainData(domain);

  const parts = [`BIMI DNS for ${domain}`];
  if (row?.bimiGrade) parts.push(`Grade: ${row.bimiGrade}`);
  if (row?.dmarcPolicy) parts.push(`DMARC policy: ${row.dmarcPolicy}`);
  if (row?.bimiLogoUrl) parts.push("Logo published");
  else parts.push("No logo");

  const ogImage = `/api/og/domain/${encodeURIComponent(domain)}`;

  return {
    alternates: { canonical: `/domains/${domain}` },
    title: `BIMI DNS for ${domain}`,
    description: parts.join(" | "),
    openGraph: {
      title: `BIMI DNS for ${domain}`,
      description: parts.join(" | "),
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `BIMI DNS for ${domain}`,
      description: parts.join(" | "),
      images: [ogImage],
    },
  };
}

function serializeRow(row: NonNullable<Awaited<ReturnType<typeof getDomainData>>>) {
  return {
    bimiRecordRaw: row.bimiRecordRaw,
    bimiVersion: row.bimiVersion,
    bimiLogoUrl: row.bimiLogoUrl,
    bimiAuthorityUrl: row.bimiAuthorityUrl,
    bimiLpsTag: row.bimiLpsTag,
    bimiAvpTag: row.bimiAvpTag,
    bimiDeclination: row.bimiDeclination,
    bimiSelector: row.bimiSelector,
    bimiOrgDomainFallback: row.bimiOrgDomainFallback,
    dmarcRecordRaw: row.dmarcRecordRaw,
    dmarcPolicy: row.dmarcPolicy,
    dmarcPct: row.dmarcPct,
    dmarcValid: row.dmarcValid,
    svgFetched: row.svgFetched,
    svgContentType: row.svgContentType,
    svgSizeBytes: row.svgSizeBytes,
    svgTinyPsValid: row.svgTinyPsValid,
    svgValidationErrors: row.svgValidationErrors,
    svgIndicatorHash: row.svgIndicatorHash,
    bimiGrade: row.bimiGrade,
    dnsSnapshot: row.dnsSnapshot ?? null,
    lastChecked: row.lastChecked instanceof Date ? row.lastChecked.toISOString() : (row.lastChecked ?? null),
  };
}

export default async function DomainPage({ params, searchParams }: Props) {
  const { domain: rawDomain } = await params;
  const { fresh } = await searchParams;
  const domain = await resolveDomain(rawDomain);

  // Redirect non-canonical URLs (uppercase, trailing dots) to canonical form
  if (decodeURIComponent(rawDomain) !== domain) {
    permanentRedirect(`/domains/${encodeURIComponent(domain)}`);
  }

  const triggerFreshCheck = fresh === "1";
  const row = await getDomainData(domain);

  if (!row && !triggerFreshCheck) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">No BIMI data for {domain}</h1>
        <p className="text-muted-foreground mt-2">
          We haven&apos;t checked this domain yet.{" "}
          <Link href={`/check?q=${encodeURIComponent(domain)}`} className="text-primary underline">
            Run a check
          </Link>{" "}
          to fetch its BIMI/DMARC records.
        </p>
      </div>
    );
  }

  return <DomainDetail domain={domain} data={row ? serializeRow(row) : null} triggerFreshCheck={triggerFreshCheck} />;
}
