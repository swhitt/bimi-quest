import { cache } from "react";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { displayIntermediateCa } from "@/lib/ca-display";
import { db } from "@/lib/db";
import { certificates, domainBimiState, logos } from "@/lib/db/schema";
import { domainSlug } from "@/lib/domain-slug";
import { LogoDetailClient } from "./logo-detail-client";

interface Props {
  params: Promise<{ hash: string; slug?: string[] }>;
}

/** Look up a logo by hash (exact or prefix), returning logo + representative cert data. */
const getLogo = cache(async (hash: string) => {
  // Try fingerprint prefix first (for legacy /logos/{cert-fp-prefix} URLs)
  const [byFp] = await db
    .select({
      svgHash: certificates.logotypeSvgHash,
      org: certificates.subjectOrg,
      domain: certificates.sanList,
      certType: certificates.certType,
      markType: certificates.markType,
      issuer: certificates.issuerOrg,
      rootCa: certificates.rootCaOrg,
      score: certificates.notabilityScore,
      reason: certificates.notabilityReason,
      description: certificates.companyDescription,
      country: certificates.subjectCountry,
      notBefore: certificates.notBefore,
      notAfter: certificates.notAfter,
      fingerprintSha256: certificates.fingerprintSha256,
      isPrecert: certificates.isPrecert,
      ctLogIndex: certificates.ctLogIndex,
    })
    .from(certificates)
    .where(and(sql`${certificates.fingerprintSha256} LIKE ${hash + "%"}`, isNotNull(certificates.logotypeSvgHash)))
    .limit(1);
  if (byFp?.svgHash) {
    const [logo] = await db
      .select({ svgContent: logos.svgContent, qualityScore: logos.qualityScore })
      .from(logos)
      .where(eq(logos.svgHash, byFp.svgHash))
      .limit(1);
    return { ...byFp, svg: logo?.svgContent ?? null, logoQuality: logo?.qualityScore ?? null };
  }

  // Primary: look up logo by SVG hash prefix, then get representative cert
  const [logo] = await db
    .select({
      svgHash: logos.svgHash,
      svgContent: logos.svgContent,
      qualityScore: logos.qualityScore,
    })
    .from(logos)
    .where(sql`${logos.svgHash} LIKE ${hash + "%"}`)
    .limit(1);
  if (!logo) return null;

  // Get representative cert (highest notability) for this logo
  const [cert] = await db
    .select({
      org: certificates.subjectOrg,
      domain: certificates.sanList,
      certType: certificates.certType,
      markType: certificates.markType,
      issuer: certificates.issuerOrg,
      rootCa: certificates.rootCaOrg,
      score: certificates.notabilityScore,
      reason: certificates.notabilityReason,
      description: certificates.companyDescription,
      country: certificates.subjectCountry,
      notBefore: certificates.notBefore,
      notAfter: certificates.notAfter,
      fingerprintSha256: certificates.fingerprintSha256,
      isPrecert: certificates.isPrecert,
      ctLogIndex: certificates.ctLogIndex,
    })
    .from(certificates)
    .where(eq(certificates.logotypeSvgHash, logo.svgHash))
    .orderBy(desc(certificates.notabilityScore))
    .limit(1);

  if (cert) {
    return {
      svgHash: logo.svgHash,
      svg: logo.svgContent,
      logoQuality: logo.qualityScore,
      ...cert,
    };
  }

  // DNS-only logo: check domain_bimi_state for context
  const [domainRow] = await db
    .select({ domain: domainBimiState.domain })
    .from(domainBimiState)
    .where(eq(domainBimiState.svgIndicatorHash, logo.svgHash))
    .limit(1);

  return {
    svgHash: logo.svgHash,
    svg: logo.svgContent,
    logoQuality: logo.qualityScore,
    org: domainRow?.domain ?? null,
    domain: domainRow ? [domainRow.domain] : [],
    certType: null,
    markType: null,
    issuer: null,
    rootCa: null,
    score: null,
    reason: null,
    description: null,
    country: null,
    notBefore: null,
    notAfter: null,
    fingerprintSha256: logo.svgHash,
    isPrecert: false,
    ctLogIndex: null,
  };
});

/** Fetch cross-reference data: all certs, domains, and orgs sharing this logo. */
const getCrossRefs = cache(async (svgHash: string) => {
  const [relatedCerts, relatedDomains] = await Promise.all([
    db
      .select({
        fingerprintSha256: certificates.fingerprintSha256,
        subjectOrg: certificates.subjectOrg,
        certType: certificates.certType,
        notBefore: certificates.notBefore,
        notAfter: certificates.notAfter,
        isPrecert: certificates.isPrecert,
        sanList: certificates.sanList,
      })
      .from(certificates)
      .where(eq(certificates.logotypeSvgHash, svgHash))
      .orderBy(desc(certificates.notBefore))
      .limit(50),
    db
      .select({ domain: domainBimiState.domain })
      .from(domainBimiState)
      .where(eq(domainBimiState.svgIndicatorHash, svgHash)),
  ]);

  // Distinct orgs from certs
  const orgSet = new Set<string>();
  for (const c of relatedCerts) {
    if (c.subjectOrg) orgSet.add(c.subjectOrg);
  }

  return {
    certs: relatedCerts,
    domains: relatedDomains.map((d) => d.domain),
    orgs: Array.from(orgSet),
  };
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

  const crossRefs = logo.svgHash ? await getCrossRefs(logo.svgHash) : null;

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
      crossRefs={
        crossRefs
          ? {
              certs: crossRefs.certs.map((c) => ({
                fingerprintSha256: c.fingerprintSha256,
                subjectOrg: c.subjectOrg,
                certType: c.certType,
                notBefore: c.notBefore.toISOString(),
                notAfter: c.notAfter.toISOString(),
                isPrecert: c.isPrecert ?? false,
              })),
              domains: crossRefs.domains,
              orgs: crossRefs.orgs,
            }
          : null
      }
    />
  );
}
