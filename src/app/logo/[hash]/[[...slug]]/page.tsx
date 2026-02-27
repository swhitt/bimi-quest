import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { sql, and, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { displayIssuerOrg } from "@/lib/ca-display";
import { LogoDetailClient } from "./logo-detail-client";

interface Props {
  params: Promise<{ hash: string; slug?: string[] }>;
}

function domainSlug(domain: string): string {
  // Extract the main part of the domain (e.g. "aws" from "aws.com")
  const parts = domain.replace(/^www\./, "").split(".");
  return (parts.length >= 2 ? parts[parts.length - 2] : parts[0])?.toLowerCase() || "logo";
}

async function getLogo(hash: string) {
  const [row] = await db
    .select({
      svgHash: certificates.logotypeSvgHash,
      svg: certificates.logotypeSvg,
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
    })
    .from(certificates)
    .where(
      and(
        sql`${certificates.fingerprintSha256} LIKE ${hash + "%"}`,
        isNotNull(certificates.logotypeSvg),
      )
    )
    .limit(1);
  return row ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hash } = await params;
  const logo = await getLogo(hash);
  if (!logo) return { title: "Logo Not Found" };

  const primaryDomain = logo.domain?.[0] ?? "";
  const org = logo.org ?? primaryDomain;

  const issuer = logo.issuer ? displayIssuerOrg(logo.issuer) : "unknown CA";
  const markLabel = logo.certType ?? "Certificate";
  const descParts = [
    `BIMI ${markLabel} logo for ${org}${primaryDomain ? ` (${primaryDomain})` : ""}`,
    `Issued by ${issuer}`,
    "View certificate details and BIMI validation on bimi.quest",
  ];
  const description = descParts.join(" | ");
  const ogImageUrl = logo.svgHash ? `/api/og/logo/${logo.svgHash}` : undefined;

  return {
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
    redirect(`/logo/${hash}/${expectedSlug}`);
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
        issuer: logo.issuer ? displayIssuerOrg(logo.issuer) : null,
        rawIssuer: logo.issuer,
        rootCa: logo.rootCa,
        score: logo.score,
        reason: logo.reason,
        description: logo.description,
        country: logo.country,
        notBefore: logo.notBefore?.toISOString() ?? null,
        notAfter: logo.notAfter?.toISOString() ?? null,
        fingerprintSha256: logo.fingerprintSha256,
        isPrecert: logo.isPrecert ?? false,
      }}
    />
  );
}
