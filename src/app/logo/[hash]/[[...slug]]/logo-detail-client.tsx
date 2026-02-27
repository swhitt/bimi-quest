"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { LogoSvg } from "@/components/logo-svg";
import { stripWhiteSvgBg, tileBgForSvg, isLightBg, DARK_BG, LIGHT_BG } from "@/lib/svg-bg";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMarkTypeInfo } from "@/lib/mark-types";
import { Sun, Moon, ExternalLink, Shield, Award, Star } from "lucide-react";
import { formatUtcFull } from "@/components/ui/utc-time";

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
  reason: string | null;
  description: string | null;
  country: string | null;
  notBefore: string | null;
  notAfter: string | null;
  fingerprintSha256: string;
  isPrecert: boolean;
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
  const autoBg = useMemo(() => {
    if (!logo.svg) return DARK_BG;
    const stripped = stripWhiteSvgBg(logo.svg);
    return tileBgForSvg(stripped);
  }, [logo.svg]);
  const autoIsLight = isLightBg(autoBg);
  const strippedSvg = useMemo(() => logo.svg ? stripWhiteSvgBg(logo.svg) : null, [logo.svg]);

  const [bgMode, setBgMode] = useState<"auto" | "dark" | "light">("auto");
  const now = new Date();
  const isExpired = logo.notAfter ? new Date(logo.notAfter) < now : false;
  const mtInfo = getMarkTypeInfo(logo.markType);

  const certTypeLabel = logo.certType === "VMC"
    ? "Verified Mark Certificate"
    : logo.certType === "CMC"
    ? "Common Mark Certificate"
    : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/logos" className="hover:text-foreground transition-colors">Gallery</Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="text-foreground truncate font-medium">{logo.org}</span>
      </nav>

      {/* Hero: Logo + Identity */}
      <div className="flex flex-col items-center gap-5">
        {/* Logo with background toggle */}
        <div className="relative group">
          <div
            className={`w-72 h-72 rounded-2xl p-5 ring-1 transition-colors duration-200
              [&>div>svg]:h-full [&>div>svg]:w-full
              ${bgMode === "light" || (bgMode === "auto" && autoIsLight)
                ? "ring-black/10"
                : "ring-white/10"
              }`}
            style={{
              backgroundColor:
                bgMode === "auto" ? autoBg
                : bgMode === "dark" ? DARK_BG
                : LIGHT_BG,
            }}
          >
            {logo.svg ? (
              <LogoSvg svg={bgMode === "light" ? logo.svg : (strippedSvg ?? logo.svg)} className="h-full w-full [&>svg]:h-full [&>svg]:w-full" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                No image
              </div>
            )}
          </div>
          {/* Background toggle */}
          <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => setBgMode(bgMode === "auto" ? "light" : bgMode === "light" ? "dark" : "auto")}
              title={`Background: ${bgMode} (click to cycle)`}
              className="backdrop-blur-sm bg-background/80 shadow-md"
            >
              {(bgMode === "dark" || (bgMode === "auto" && !autoIsLight))
                ? <Sun className="size-3.5" />
                : <Moon className="size-3.5" />}
            </Button>
          </div>
        </div>

        {/* Identity block */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight flex items-center justify-center gap-2">
            {logo.country && (
              <span title={logo.country} className="text-xl">{countryFlag(logo.country)}</span>
            )}
            {logo.org}
          </h1>

          {logo.description && (
            <p className="text-sm text-muted-foreground max-w-md">{logo.description}</p>
          )}

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
                <svg className="mr-1 size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {mtInfo.iconPaths.map((d, i) => <path key={i} d={d} />)}
                </svg>
                {mtInfo.label}
              </Badge>
            )}
            {logo.isPrecert && (
              <Badge variant="secondary" className="border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                Precert
              </Badge>
            )}
            {isExpired && (
              <Badge variant="destructive">Expired</Badge>
            )}
          </div>

          {/* Score */}
          {logo.score != null && (
            <div className="flex flex-col items-center gap-1 pt-1">
              <ScoreStars score={logo.score} />
              {logo.reason && (
                <p className="text-xs text-muted-foreground max-w-sm">{logo.reason}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Details card */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="divide-y">
          <DetailRow label="Certificate" href={`/certificates/${logo.fingerprintSha256.slice(0, 12)}`}>
            <span className="font-mono text-xs">{logo.fingerprintSha256.slice(0, 16)}&hellip;</span>
          </DetailRow>

          {logo.issuer && (
            <DetailRow label="Issuer">
              {logo.issuer}
              {logo.rootCa && logo.rootCa !== logo.rawIssuer && (
                <span className="text-muted-foreground"> via {logo.rootCa}</span>
              )}
            </DetailRow>
          )}

          {logo.primaryDomain && (
            <DetailRow label="Domain" href={`/hosts/${encodeURIComponent(logo.primaryDomain)}`}>
              {logo.primaryDomain}
              {logo.domains.length > 1 && (
                <span className="text-muted-foreground"> +{logo.domains.length - 1} more</span>
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
        </div>

        {/* Action links */}
        <div className="flex flex-wrap gap-3 p-4 bg-muted/30">
          <Link
            href={`/certificates/${logo.fingerprintSha256.slice(0, 12)}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Award className="size-3.5" />
            View certificate
          </Link>
          {logo.org && logo.org !== "Unknown" && (
            <Link
              href={`/orgs/${encodeURIComponent(logo.org)}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              All certs for {logo.org}
            </Link>
          )}
          {logo.primaryDomain && (
            <Link
              href={`/validate?domain=${encodeURIComponent(logo.primaryDomain)}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <ExternalLink className="size-3.5" />
              Validate BIMI
            </Link>
          )}
        </div>
      </div>

    </div>
  );
}

function DetailRow({
  label,
  href,
  children,
}: {
  label: string;
  href?: string;
  children: React.ReactNode;
}) {
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
