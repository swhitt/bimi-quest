"use client";

import { Award, Shield, Star } from "lucide-react";
import Link from "next/link";
import { DomainChip } from "@/components/domain-chip";
import { LogoCard } from "@/components/logo-card";
import { OrgChip } from "@/components/org-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChainLinkIcon } from "@/components/ui/icons";
import { formatUtcFull } from "@/components/ui/utc-time";
import { certUrl, orgUrl, validateUrl } from "@/lib/entity-urls";
import { getMarkTypeInfo } from "@/lib/mark-types";

interface LogoData {
  svg: string | null;
  org: string;
  primaryDomain: string;
  domains: string[];
  certType: string | null;
  markType: string | null;
  issuer: string | null;
  rawIssuer: string | null;
  rootCa: string | null;
  score: number | null;
  logoQuality: number | null;
  reason: string | null;
  description: string | null;
  country: string | null;
  notBefore: string | null;
  notAfter: string | null;
  fingerprintSha256: string | null;
  isPrecert: boolean;
  ctLogIndex: string | null;
}

function countryFlag(code: string): string {
  return code
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

function ScoreStars({ score }: { score: number }) {
  // Map 1-10 to 0.5-5 stars
  const stars = score / 2;
  const full = Math.floor(stars);
  const half = stars % 1 >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);

  return (
    <div className="flex items-center gap-0.5" title={`${score}/10 notability`}>
      {Array.from({ length: full }, (_, i) => (
        <Star key={`f${i}`} className="size-4 fill-amber-400 text-amber-400" />
      ))}
      {half && (
        <span className="relative inline-block size-4">
          <Star className="absolute inset-0 size-4 text-amber-400/30" />
          <span className="absolute inset-0 overflow-hidden" style={{ width: "50%" }}>
            <Star className="size-4 fill-amber-400 text-amber-400" />
          </span>
        </span>
      )}
      {Array.from({ length: empty }, (_, i) => (
        <Star key={`e${i}`} className="size-4 text-amber-400/30" />
      ))}
    </div>
  );
}

export function LogoDetailClient({ logo }: { logo: LogoData }) {
  const now = new Date();
  const isExpired = logo.notAfter ? new Date(logo.notAfter) < now : false;
  const mtInfo = getMarkTypeInfo(logo.markType);

  const certTypeLabel =
    logo.certType === "VMC" ? "Verified Mark Certificate" : logo.certType === "CMC" ? "Common Mark Certificate" : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/logos" className="hover:text-foreground transition-colors">
          Gallery
        </Link>
        <span className="text-muted-foreground">/</span>
        <OrgChip org={logo.org} compact className="text-foreground font-medium" />
      </nav>

      {/* Hero: Logo + Identity */}
      <div className="flex flex-col items-center gap-5">
        {/* Logo with background toggle */}
        <LogoCard svg={logo.svg} size="lg" />

        {/* Identity block */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight flex items-center justify-center gap-2">
            {logo.country && (
              <span title={logo.country} className="text-xl">
                {countryFlag(logo.country)}
              </span>
            )}
            {logo.org}
          </h1>

          {logo.description && <p className="text-sm text-muted-foreground max-w-md">{logo.description}</p>}

          {/* Badges row */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {logo.certType && (
              <Badge variant="outline" title={certTypeLabel ?? undefined}>
                <Shield className="mr-1 size-3" />
                {logo.certType}
              </Badge>
            )}
            {mtInfo && (
              <Badge variant="secondary" className={mtInfo.badgeClass}>
                <svg
                  className="mr-1 size-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {mtInfo.iconPaths.map((d, i) => (
                    <path key={i} d={d} />
                  ))}
                </svg>
                {mtInfo.label}
              </Badge>
            )}
            {logo.isPrecert && (
              <Badge
                variant="secondary"
                className="border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
              >
                Precert
              </Badge>
            )}
            {isExpired && <Badge variant="destructive">Expired</Badge>}
          </div>

          {/* Score */}
          {logo.score != null && (
            <div className="flex flex-col items-center gap-1 pt-1">
              <ScoreStars score={logo.score} />
              {logo.reason && <p className="text-xs text-muted-foreground max-w-sm">{logo.reason}</p>}
            </div>
          )}

          {/* Primary action */}
          {logo.fingerprintSha256 && (
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href={certUrl(logo.fingerprintSha256)}>
                <Award className="mr-1.5 size-3.5" />
                View certificate details
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Details card */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="divide-y">
          {logo.fingerprintSha256 && (
            <DetailRow label="Certificate" href={certUrl(logo.fingerprintSha256)}>
              <span className="font-mono text-xs truncate">{logo.fingerprintSha256}</span>
            </DetailRow>
          )}

          {logo.issuer && (
            <DetailRow label="Intermediate CA">
              {logo.issuer}
              {logo.rootCa && logo.rootCa !== logo.rawIssuer && (
                <span className="text-muted-foreground"> via {logo.rootCa}</span>
              )}
            </DetailRow>
          )}

          {logo.primaryDomain && (
            <DetailRow label="Domain">
              <DomainChip domain={logo.primaryDomain} size="xs" />
              {logo.domains.length > 1 && (
                <span className="text-muted-foreground ml-1">+{logo.domains.length - 1} more</span>
              )}
            </DetailRow>
          )}

          {logo.notBefore && (
            <DetailRow label="Issued">
              <span className="tabular-nums">{formatUtcFull(logo.notBefore)}</span>
            </DetailRow>
          )}

          {logo.notAfter && (
            <DetailRow label="Expires">
              <span className={`tabular-nums ${isExpired ? "text-destructive" : ""}`}>
                {formatUtcFull(logo.notAfter)}
                {isExpired && " (expired)"}
              </span>
            </DetailRow>
          )}

          {logo.logoQuality != null && (
            <DetailRow label="Logo Quality">
              <span className="tabular-nums">{logo.logoQuality}/10</span>
            </DetailRow>
          )}
        </div>

        {/* Action links */}
        <div className="flex flex-wrap gap-3 p-4 bg-muted/30">
          {logo.org && logo.org !== "Unknown" && (
            <Link
              href={orgUrl(logo.org)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <Award className="size-3.5" />
              All certs for {logo.org}
            </Link>
          )}
          {logo.primaryDomain && (
            <Link
              href={validateUrl(logo.primaryDomain)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <Shield className="size-3.5" />
              Validate BIMI
            </Link>
          )}
          {logo.ctLogIndex && (
            <Link
              href={`/ct/gorgon/${logo.ctLogIndex}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <ChainLinkIcon className="size-3.5" />
              CT log entry #{Number(logo.ctLogIndex).toLocaleString()}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, href, children }: { label: string; href?: string; children: React.ReactNode }) {
  const value = href ? (
    <Link href={href} className="text-primary hover:underline">
      {children}
    </Link>
  ) : (
    children
  );

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right truncate">{value}</span>
    </div>
  );
}
