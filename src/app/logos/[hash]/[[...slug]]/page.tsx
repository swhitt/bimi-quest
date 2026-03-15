import { cache } from "react";
import { and, isNotNull, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { displayIntermediateCa } from "@/lib/ca-display";
import { db } from "@/lib/db";
import { certificates, domainBimiState } from "@/lib/db/schema";
import { domainSlug } from "@/lib/domain-slug";
import { LogoDetailClient } from "./logo-detail-client";

interface Props {
  params: Promise<{ hash: string; slug?: string[] }>;
}

const LOGO_COLUMNS = {
  svgHash: certificates.logotypeSvgHash,
  svg: certificates.logotypeSvg,
  org: certificates.subjectOrg,
  domain: certificates.sanList,
  certType: certificates.certType,
  markType: certificates.markType,
  issuer: certificates.issuerOrg,
  rootCa: certificates.rootCaOrg,
  score: certificates.notabilityScore,
  logoQuality: certificates.logoQualityScore,
  reason: certificates.notabilityReason,
  description: certificates.companyDescription,
  country: certificates.subjectCountry,
  notBefore: certificates.notBefore,
  notAfter: certificates.notAfter,
  fingerprintSha256: certificates.fingerprintSha256,
  isPrecert: certificates.isPrecert,
  ctLogIndex: certificates.ctLogIndex,
};

/** Deduplicated logo lookup shared by generateMetadata and the page component. */
const getLogo = cache(async (hash: string) => {
  // Try certificate fingerprint prefix first
  const [byFp] = await db
    .select(LOGO_COLUMNS)
    .from(certificates)
    .where(and(sql`${certificates.fingerprintSha256} LIKE ${hash + "%"}`, isNotNull(certificates.logotypeSvg)))
    .limit(1);
  if (byFp) return byFp;

  // Fall back to SVG content hash in certificates table
  const [bySvgHash] = await db
    .select(LOGO_COLUMNS)
    .from(certificates)
    .where(and(sql`${certificates.logotypeSvgHash} LIKE ${hash + "%"}`, isNotNull(certificates.logotypeSvg)))
    .limit(1);
  if (bySvgHash) return bySvgHash;

  // Final fallback: domain_bimi_state (logos fetched from BIMI DNS, no cert in our DB)
  const [byDomain] = await db
    .select({
      svgContent: domainBimiState.svgContent,
      svgHash: domainBimiState.svgIndicatorHash,
      domain: domainBimiState.domain,
    })
    .from(domainBimiState)
    .where(and(sql`${domainBimiState.svgIndicatorHash} LIKE ${hash + "%"}`, isNotNull(domainBimiState.svgContent)))
    .limit(1);
  if (byDomain) {
    return {
      svgHash: byDomain.svgHash,
      svg: byDomain.svgContent,
      org: byDomain.domain,
      domain: [byDomain.domain],
      certType: null,
      markType: null,
      issuer: null,
      rootCa: null,
      score: null,
      logoQuality: null,
      reason: null,
      description: null,
      country: null,
      notBefore: null,
      notAfter: null,
      fingerprintSha256: byDomain.svgHash ?? hash,
      isPrecert: false,
      ctLogIndex: null,
    };
  }

  return null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hash } = await params;
  const logo = await getLogo(hash);
  if (!logo) return { title: "Logo Not Found" };

  const primaryDomain = logo.domain?.[0] ?? "";
  const org = logo.org ?? primaryDomain;
  const expectedSlug = primaryDomain ? domainSlug(primaryDomain) : "logo";

  const issuer = logo.issuer ? displayIntermediateCa(logo.issuer) : "unknown CA";
  const markLabel = logo.certType ?? "Certificate";
  const descParts = [
    `BIMI ${markLabel} logo for ${org}${primaryDomain ? ` (${primaryDomain})` : ""}`,
    `Issued by ${issuer}`,
    "View certificate details and BIMI validation on bimi.quest",
  ];
  const description = descParts.join(" | ");
  const ogImageUrl = logo.svgHash ? `/api/og/logo/${logo.svgHash}` : undefined;

  return {
    alternates: { canonical: `/logos/${hash}/${expectedSlug}` },
    title: `${org} BIMI Logo`,
    description,
    openGraph: {
      title: `${org} BIMI Logo`,
      description,
      images: ogImageUrl ? [{ url: ogImageUrl, width: 1200, height: 630 }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: `${org} BIMI Logo`,
      description,
      images: ogImageUrl ? [{ url: ogImageUrl, width: 1200, height: 630 }] : [],
    },
  };
}

export default async function LogoPage({ params }: Props) {
  const { hash, slug } = await params;
  const logo = await getLogo(hash);
  if (!logo) notFound();

  const primaryDomain = logo.domain?.[0] ?? "";
  const expectedSlug = primaryDomain ? domainSlug(primaryDomain) : "logo";

  // Redirect to canonical URL if slug is missing or wrong
  if (!slug?.[0] || slug[0] !== expectedSlug) {
    redirect(`/logos/${hash}/${expectedSlug}`);
  }

  return (
    <LogoDetailClient
      logo={{
        svg: logo.svg,
        org: logo.org ?? "Unknown",
        primaryDomain,
        domains: logo.domain ?? [],
        certType: logo.certType,
        markType: logo.markType,
        issuer: logo.issuer ? displayIntermediateCa(logo.issuer) : null,
        rawIssuer: logo.issuer,
        rootCa: logo.rootCa,
        score: logo.score,
        logoQuality: logo.logoQuality,
        reason: logo.reason,
        description: logo.description,
        country: logo.country,
        notBefore: logo.notBefore?.toISOString() ?? null,
        notAfter: logo.notAfter?.toISOString() ?? null,
        fingerprintSha256: logo.certType ? logo.fingerprintSha256 : null,
        isPrecert: logo.isPrecert ?? false,
        ctLogIndex: logo.ctLogIndex != null ? String(logo.ctLogIndex) : null,
      }}
    />
  );
}
