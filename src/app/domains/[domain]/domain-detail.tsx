"use client";

import Link from "next/link";
import type { DnsSnapshot } from "@/lib/db/schema";
import { computeReadinessScore, type ReadinessResult, type ReadinessTier } from "@/lib/bimi/readiness-score";
import { domainUrl } from "@/lib/entity-urls";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BimiInboxPreview } from "@/components/bimi-inbox-preview";
import { DomainWatchButton } from "@/components/domain-watch-button";

interface DomainDetailProps {
  domain: string;
  data: {
    bimiRecordRaw: string | null;
    bimiVersion: string | null;
    bimiLogoUrl: string | null;
    bimiAuthorityUrl: string | null;
    bimiLpsTag: string | null;
    bimiAvpTag: string | null;
    bimiDeclination: boolean | null;
    bimiSelector: string | null;
    bimiOrgDomainFallback: boolean | null;
    dmarcRecordRaw: string | null;
    dmarcPolicy: string | null;
    dmarcPct: number | null;
    dmarcValid: boolean | null;
    svgFetched: boolean | null;
    svgContentType: string | null;
    svgSizeBytes: number | null;
    svgTinyPsValid: boolean | null;
    svgValidationErrors: string[] | null;
    svgIndicatorHash: string | null;
    bimiGrade: string | null;
    dnsSnapshot: DnsSnapshot | null;
    lastChecked: string | null;
  };
}

const GRADE_COLORS: Record<string, string> = {
  A: "bg-green-600 text-white",
  B: "bg-lime-600 text-white",
  C: "bg-yellow-500 text-black",
  D: "bg-orange-500 text-white",
  F: "bg-red-600 text-white",
};

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <>
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className={cn("text-sm break-all", mono && "font-mono")}>
        {typeof value === "object" ? value : String(value)}
      </dd>
    </>
  );
}

function BoolBadge({ value, trueLabel, falseLabel }: { value: boolean | null; trueLabel: string; falseLabel: string }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground text-sm">—</span>;
  return (
    <Badge className={cn(value ? "bg-green-600 text-white" : "bg-red-600 text-white")}>
      {value ? trueLabel : falseLabel}
    </Badge>
  );
}

interface GradeCheck {
  label: string;
  passed: boolean;
  detail: string;
}

/** Derive grade-relevant checks from the DnsSnapshot data. */
function deriveGradeChecks(snap: DnsSnapshot): GradeCheck[] {
  const checks: GradeCheck[] = [];

  // DMARC policy must be reject or quarantine with pct=100
  const dmarcPolicy = snap.dmarc?.policy?.toLowerCase();
  const dmarcPct = snap.dmarc?.pct;
  const dmarcOk = snap.dmarc?.validForBimi ?? false;
  checks.push({
    label: "DMARC policy is reject or quarantine (pct=100)",
    passed: dmarcOk,
    detail: dmarcPolicy ? `p=${dmarcPolicy}, pct=${dmarcPct ?? "not set"}` : "No DMARC record found",
  });

  // BIMI record found
  const bimiFound = snap.bimi?.raw != null && !snap.bimi?.declined;
  checks.push({
    label: "BIMI record found",
    passed: bimiFound,
    detail: snap.bimi?.declined
      ? "Domain has explicitly declined BIMI"
      : snap.bimi?.raw
        ? `v=${snap.bimi.version ?? "BIMI1"}`
        : "No BIMI TXT record",
  });

  // SVG logo found and Tiny PS compliant
  const svgFound = snap.svg?.found ?? false;
  const svgValid = snap.svg?.tinyPsValid ?? false;
  checks.push({
    label: "SVG logo found and valid (Tiny PS compliant)",
    passed: svgFound && svgValid,
    detail: !svgFound
      ? "SVG not fetched"
      : svgValid
        ? `${(snap.svg?.sizeBytes ?? 0).toLocaleString()} bytes, Tiny PS valid`
        : "SVG fetched but Tiny PS validation failed",
  });

  // VMC/CMC certificate present
  const certFound = snap.certificate?.found ?? false;
  checks.push({
    label: "VMC/CMC certificate present",
    passed: certFound,
    detail: certFound
      ? `${snap.certificate?.certType ?? "Certificate"} from ${snap.certificate?.issuer ?? "unknown"}`
      : snap.bimi?.authorityUrl
        ? "Certificate could not be fetched"
        : "No authority URL specified",
  });

  return checks;
}

const TIER_COLORS: Record<ReadinessTier, string> = {
  Excellent: "bg-green-600 text-white",
  Good: "bg-lime-600 text-white",
  Fair: "bg-yellow-500 text-black",
  Poor: "bg-orange-500 text-white",
  None: "bg-red-600 text-white",
};

const TIER_BAR_COLORS: Record<ReadinessTier, string> = {
  Excellent: "bg-green-600",
  Good: "bg-lime-600",
  Fair: "bg-yellow-500",
  Poor: "bg-orange-500",
  None: "bg-red-600",
};

function ReadinessScoreCard({ result }: { result: ReadinessResult }) {
  const pct = Math.round((result.score / result.maxScore) * 100);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          BIMI Readiness Score
          <Badge className={cn(TIER_COLORS[result.tier])}>{result.tier}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score bar */}
        <div className="flex items-center gap-4">
          <span className="text-3xl font-bold tabular-nums">{result.score}</span>
          <span className="text-muted-foreground text-lg">/&thinsp;{result.maxScore}</span>
          <div className="bg-muted relative h-3 flex-1 overflow-hidden rounded-full">
            <div
              className={cn("h-full rounded-full transition-all", TIER_BAR_COLORS[result.tier])}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Check list */}
        <ul className="space-y-2">
          {result.checks.map((check) => (
            <li key={check.label} className="flex items-start gap-2 text-sm">
              <span
                className={cn(
                  "mt-0.5 shrink-0 font-mono text-base leading-none",
                  check.passed ? "text-green-600" : "text-red-600",
                )}
              >
                {check.passed ? "\u2713" : "\u2717"}
              </span>
              <div className="flex-1">
                <span className="font-medium">{check.label}</span>
                <span className="text-muted-foreground ml-2">{check.detail}</span>
              </div>
              <span
                className={cn("shrink-0 tabular-nums", check.points > 0 ? "text-green-600" : "text-muted-foreground")}
              >
                {check.points}/{check.maxPoints}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * Synthesize a DnsSnapshot from flat domain_bimi_state columns so that
 * Grade Breakdown and Readiness Score cards render for DNS-backfilled domains
 * that don't have a full dnsSnapshot JSON blob.
 */
function synthesizeSnapshot(data: DomainDetailProps["data"]): DnsSnapshot {
  const dmarcPolicy = data.dmarcPolicy?.toLowerCase() ?? null;
  const isRejectOrQuarantine = dmarcPolicy === "reject" || dmarcPolicy === "quarantine";
  const pct = data.dmarcPct;
  const dmarcValidForBimi = isRejectOrQuarantine && (pct === null || pct === 100);

  return {
    bimi: {
      raw: data.bimiRecordRaw,
      version: data.bimiVersion,
      logoUrl: data.bimiLogoUrl,
      authorityUrl: data.bimiAuthorityUrl,
      lps: data.bimiLpsTag,
      avp: data.bimiAvpTag,
      declined: data.bimiDeclination ?? false,
      selector: data.bimiSelector ?? "default",
      orgDomainFallback: data.bimiOrgDomainFallback ?? false,
    },
    dmarc: data.dmarcRecordRaw
      ? {
          raw: data.dmarcRecordRaw,
          policy: dmarcPolicy,
          sp: null,
          pct,
          rua: null,
          ruf: null,
          adkim: null,
          aspf: null,
          validForBimi: data.dmarcValid ?? dmarcValidForBimi,
        }
      : null,
    svg: data.svgFetched
      ? {
          found: true,
          sizeBytes: data.svgSizeBytes,
          contentType: data.svgContentType,
          tinyPsValid: data.svgTinyPsValid,
          indicatorHash: data.svgIndicatorHash,
          validationErrors: data.svgValidationErrors,
        }
      : null,
    certificate: data.bimiAuthorityUrl
      ? { found: false, authorityUrl: data.bimiAuthorityUrl, certType: null, issuer: null }
      : null,
    meta: {
      checkedAt: data.lastChecked ?? new Date().toISOString(),
      grade: data.bimiGrade,
    },
  };
}

export function DomainDetail({ domain, data }: DomainDetailProps) {
  // Use real dnsSnapshot when available, otherwise synthesize from flat columns
  const snapshot = data.dnsSnapshot ?? synthesizeSnapshot(data);

  const bimi = snapshot.bimi;
  const dmarc = snapshot.dmarc;
  const svg = snapshot.svg;
  const cert = snapshot.certificate;

  const bimiRaw = bimi?.raw ?? data.bimiRecordRaw;
  const dmarcRaw = dmarc?.raw ?? data.dmarcRecordRaw;

  const logoUrl = bimi?.logoUrl ?? data.bimiLogoUrl;
  const authorityUrl = bimi?.authorityUrl ?? data.bimiAuthorityUrl;

  const gradeChecks = deriveGradeChecks(snapshot);
  const grade = snapshot.meta.grade ?? data.bimiGrade;
  const readiness = computeReadinessScore(snapshot);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        {logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/api/proxy/svg?url=${encodeURIComponent(logoUrl)}`}
            alt=""
            className="size-10 shrink-0 rounded border object-contain"
          />
        )}
        <h1 className="font-mono text-2xl font-bold">{domain}</h1>
        {grade && <Badge className={cn("text-base px-3 py-0.5", GRADE_COLORS[grade] ?? "bg-muted")}>{grade}</Badge>}
        <Badge className={cn("text-xs", TIER_COLORS[readiness.tier])}>
          {readiness.tier} ({readiness.score})
        </Badge>
        <div className="flex-1" />
        {data.lastChecked && (
          <span className="text-muted-foreground text-sm">Checked {new Date(data.lastChecked).toLocaleString()}</span>
        )}
        <DomainWatchButton domain={domain} />
        <Button asChild size="sm" variant="outline">
          <Link href={`/validate?q=${encodeURIComponent(domain)}`}>Re-check</Link>
        </Button>
      </div>

      {/* Grade Breakdown */}
      {gradeChecks && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              Grade Breakdown
              {grade && <Badge className={cn("text-lg px-3 py-0.5", GRADE_COLORS[grade] ?? "bg-muted")}>{grade}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {gradeChecks.map((check) => (
                <li key={check.label} className="flex items-start gap-2 text-sm">
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 font-mono text-base leading-none",
                      check.passed ? "text-green-600" : "text-red-600",
                    )}
                  >
                    {check.passed ? "\u2713" : "\u2717"}
                  </span>
                  <div>
                    <span className="font-medium">{check.label}</span>
                    <span className="text-muted-foreground ml-2">{check.detail}</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* BIMI Readiness Score */}
      {readiness && <ReadinessScoreCard result={readiness} />}

      {/* BIMI Record */}
      <Card>
        <CardHeader>
          <CardTitle>BIMI Record</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {bimiRaw ? (
            <pre className="bg-muted overflow-x-auto rounded p-3 font-mono text-xs whitespace-pre-wrap break-all">
              {bimiRaw}
            </pre>
          ) : (
            <p className="text-muted-foreground text-sm">No BIMI TXT record found.</p>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <KV label="Version" value={bimi?.version ?? data.bimiVersion} mono />
            <KV label="Logo URL" value={logoUrl} mono />
            <KV label="Authority URL" value={authorityUrl} mono />
            <KV label="LPS" value={bimi?.lps ?? data.bimiLpsTag} mono />
            <KV label="AVP" value={bimi?.avp ?? data.bimiAvpTag} mono />
            <KV label="Selector" value={bimi?.selector ?? data.bimiSelector} mono />
            <KV
              label="Org domain fallback"
              value={
                (bimi?.orgDomainFallback ?? data.bimiOrgDomainFallback) !== null
                  ? bimi?.orgDomainFallback && bimi?.orgDomain
                    ? `Yes (from ${bimi.orgDomain})`
                    : String(bimi?.orgDomainFallback ?? data.bimiOrgDomainFallback)
                  : null
              }
            />
            <KV
              label="Declined"
              value={
                (bimi?.declined ?? data.bimiDeclination) !== null
                  ? String(bimi?.declined ?? data.bimiDeclination)
                  : null
              }
            />
          </dl>
          {logoUrl && (
            <div className="mt-2">
              <p className="text-muted-foreground mb-1 text-sm">SVG Preview</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/proxy/svg?url=${encodeURIComponent(logoUrl)}`}
                alt={`BIMI logo for ${domain}`}
                className="h-24 w-24 rounded border object-contain"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* BIMI Inbox Preview */}
      <BimiInboxPreview domain={domain} logoUrl={logoUrl} grade={grade} />

      {/* DMARC Record */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            DMARC Record
            <BoolBadge
              value={dmarc?.validForBimi ?? data.dmarcValid ?? null}
              trueLabel="Valid for BIMI"
              falseLabel="Invalid for BIMI"
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {dmarcRaw ? (
            <pre className="bg-muted overflow-x-auto rounded p-3 font-mono text-xs whitespace-pre-wrap break-all">
              {dmarcRaw}
            </pre>
          ) : (
            <p className="text-muted-foreground text-sm">No DMARC TXT record found.</p>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <KV label="Policy (p)" value={dmarc?.policy ?? data.dmarcPolicy} mono />
            <KV label="Subdomain policy (sp)" value={dmarc?.sp} mono />
            <KV label="Percentage (pct)" value={dmarc?.pct ?? data.dmarcPct} />
            <KV label="rua" value={dmarc?.rua} mono />
            <KV label="ruf" value={dmarc?.ruf} mono />
            <KV label="adkim" value={dmarc?.adkim} mono />
            <KV label="aspf" value={dmarc?.aspf} mono />
            {dmarc?.fo && <KV label="Failure options (fo)" value={dmarc.fo} mono />}
          </dl>
        </CardContent>
      </Card>

      {/* SVG Status */}
      {(svg || data.svgFetched) && (
        <Card>
          <CardHeader>
            <CardTitle>SVG Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <KV
                label="Found"
                value={<BoolBadge value={svg?.found ?? data.svgFetched ?? null} trueLabel="Yes" falseLabel="No" />}
              />
              <KV label="Content-Type" value={svg?.contentType ?? data.svgContentType} mono />
              <KV
                label="Size"
                value={
                  (svg?.sizeBytes ?? data.svgSizeBytes) != null
                    ? `${(svg?.sizeBytes ?? data.svgSizeBytes!).toLocaleString()} bytes`
                    : null
                }
              />
              <KV
                label="Tiny PS valid"
                value={
                  <BoolBadge value={svg?.tinyPsValid ?? data.svgTinyPsValid ?? null} trueLabel="Yes" falseLabel="No" />
                }
              />
              <KV label="Indicator hash" value={svg?.indicatorHash ?? data.svgIndicatorHash} mono />
            </dl>
            {((svg?.validationErrors ?? data.svgValidationErrors)?.length ?? 0) > 0 && (
              <div>
                <p className="text-muted-foreground mb-1 text-sm">Validation errors</p>
                <ul className="list-inside list-disc space-y-0.5 text-sm text-red-600">
                  {(svg?.validationErrors ?? data.svgValidationErrors)!.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Certificate */}
      {(cert || data.bimiAuthorityUrl) && (
        <Card>
          <CardHeader>
            <CardTitle>Certificate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cert ? (
              <>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <KV label="Found" value={<BoolBadge value={cert.found} trueLabel="Yes" falseLabel="No" />} />
                  <KV label="Type" value={cert.certType ? <Badge variant="secondary">{cert.certType}</Badge> : null} />
                  <KV label="Issuer" value={cert.issuer} />
                  <KV label="Subject" value={cert.subject} />
                  <KV label="Serial Number" value={cert.serialNumber} mono />
                  <KV label="Not Before" value={cert.notBefore} />
                  <KV label="Not After" value={cert.notAfter} />
                  {cert.subjectAltNames && cert.subjectAltNames.length > 0 && (
                    <KV label="SANs" value={cert.subjectAltNames.join(", ")} mono />
                  )}
                  <KV label="Mark Type" value={cert.markType} />
                  {cert.logoHashValue && (
                    <KV
                      label="Logo Hash"
                      value={`${cert.logoHashAlgorithm ?? "SHA-256"}: ${cert.logoHashValue}`}
                      mono
                    />
                  )}
                  {cert.authorityUrl && (
                    <KV
                      label="Authority URL"
                      value={
                        cert.authorityUrl.startsWith("https://") ? (
                          <a
                            href={cert.authorityUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline break-all"
                          >
                            {cert.authorityUrl}
                          </a>
                        ) : (
                          <span className="font-mono break-all">{cert.authorityUrl}</span>
                        )
                      }
                    />
                  )}
                </dl>
                <Link href={domainUrl(domain)} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                  View certificates for {domain}
                </Link>
              </>
            ) : (
              <div className="space-y-3">
                {data.bimiAuthorityUrl && (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                    <KV
                      label="Authority URL"
                      value={
                        data.bimiAuthorityUrl.startsWith("https://") ? (
                          <a
                            href={data.bimiAuthorityUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline break-all"
                          >
                            {data.bimiAuthorityUrl}
                          </a>
                        ) : (
                          <span className="font-mono break-all">{data.bimiAuthorityUrl}</span>
                        )
                      }
                    />
                  </dl>
                )}
                <p className="text-muted-foreground text-sm">
                  Certificate details were not captured during initial ingestion.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/validate?q=${encodeURIComponent(domain)}`}>
                    Run a full check to see certificate details
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
