"use client";

import Link from "next/link";
import type { DnsSnapshot } from "@/lib/db/schema";
import { hostUrl } from "@/lib/entity-urls";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

export function DomainDetail({ domain, data }: DomainDetailProps) {
  // Prefer dnsSnapshot fields when available, fall back to flat columns
  const bimi = data.dnsSnapshot?.bimi;
  const dmarc = data.dnsSnapshot?.dmarc;
  const svg = data.dnsSnapshot?.svg;
  const cert = data.dnsSnapshot?.certificate;

  const bimiRaw = bimi?.raw ?? data.bimiRecordRaw;
  const dmarcRaw = dmarc?.raw ?? data.dmarcRecordRaw;

  const logoUrl = bimi?.logoUrl ?? data.bimiLogoUrl;
  const authorityUrl = bimi?.authorityUrl ?? data.bimiAuthorityUrl;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold">{domain}</h1>
        {data.bimiGrade && (
          <Badge className={cn("text-base px-3 py-0.5", GRADE_COLORS[data.bimiGrade] ?? "bg-muted")}>
            {data.bimiGrade}
          </Badge>
        )}
        <div className="flex-1" />
        {data.lastChecked && (
          <span className="text-muted-foreground text-sm">Checked {new Date(data.lastChecked).toLocaleString()}</span>
        )}
        <Button asChild size="sm" variant="outline">
          <Link href={`/validate?q=${encodeURIComponent(domain)}`}>Re-check</Link>
        </Button>
      </div>

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
                <Link href={hostUrl(domain)} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
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
