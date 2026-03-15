"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { DomainChip } from "@/components/domain-chip";
import { LogoCard } from "@/components/logo-card";
import { LogoSvg } from "@/components/logo-svg";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UtcTime } from "@/components/ui/utc-time";
import { computeDiff } from "@/lib/diff";
import { errorMessage } from "@/lib/utils";
import { Row } from "./cert-row";
import type { BimiCheckResult, CertificateBimiData, RevocationResult } from "./certificate-types";

function buildBimiChecks(
  dc: BimiCheckResult["domains"][number],
  bimiCheck: BimiCheckResult,
): { label: string; status: "pass" | "warn" | "fail"; detail: string }[] {
  const checks: {
    label: string;
    status: "pass" | "warn" | "fail";
    detail: string;
  }[] = [];

  if (dc.bimiRecord) {
    checks.push({
      label: "BIMI Record",
      status: "pass",
      detail: "Valid v=BIMI1 record found",
    });
  } else if (dc.bimiRecordCount != null && dc.bimiRecordCount > 1) {
    checks.push({
      label: "BIMI Record",
      status: "fail",
      detail: `${dc.bimiRecordCount} records found at default._bimi.${dc.domain} — ambiguous per spec, treated as no record`,
    });
  } else {
    checks.push({
      label: "BIMI Record",
      status: "fail",
      detail: `No record at default._bimi.${dc.domain}`,
    });
  }

  if (dc.dmarcValid === true) {
    checks.push({
      label: "DMARC Policy",
      status: "pass",
      detail: `${dc.dmarcPolicy} (meets BIMI requirements)`,
    });
  } else if (dc.dmarcRecordCount != null && dc.dmarcRecordCount > 1) {
    checks.push({
      label: "DMARC Policy",
      status: "fail",
      detail: `${dc.dmarcRecordCount} DMARC records found — ambiguous per RFC 7489 §6.6.3, treated as no record`,
    });
  } else if (dc.dmarcValid === false) {
    checks.push({
      label: "DMARC Policy",
      status: "fail",
      detail: dc.dmarcPolicy
        ? `Policy "${dc.dmarcPolicy}" does not meet BIMI requirements (need quarantine or reject)`
        : "No DMARC record found",
    });
  } else {
    checks.push({
      label: "DMARC Policy",
      status: "warn",
      detail: "Could not check",
    });
  }

  const cv = bimiCheck.certValidity;
  if (cv.isExpired) {
    checks.push({
      label: "Certificate",
      status: "fail",
      detail: `${cv.certType ?? "BIMI"} expired ${Math.abs(cv.daysRemaining)} days ago`,
    });
  } else if (cv.isNotYetValid) {
    checks.push({
      label: "Certificate",
      status: "fail",
      detail: `${cv.certType ?? "BIMI"} not yet valid`,
    });
  } else if (cv.daysRemaining <= 30) {
    checks.push({
      label: "Certificate",
      status: "warn",
      detail: `${cv.certType ?? "BIMI"}, expires in ${cv.daysRemaining} days`,
    });
  } else {
    checks.push({
      label: "Certificate",
      status: "pass",
      detail: `${cv.certType ?? "BIMI"}, expires in ${cv.daysRemaining} days`,
    });
  }

  if (bimiCheck.certSvgValidation) {
    if (bimiCheck.certSvgValidation.valid) {
      checks.push({
        label: "Cert SVG",
        status: "pass",
        detail: "Valid SVG Tiny PS",
      });
    } else {
      checks.push({
        label: "Cert SVG",
        status: "fail",
        detail: bimiCheck.certSvgValidation.errors.join("; "),
      });
    }
  }

  if (dc.logoUrl) {
    if (dc.webSvgFound) {
      if (dc.webSvgValidation?.valid) {
        checks.push({
          label: "Web SVG",
          status: "pass",
          detail: `Valid${dc.webSvgSizeBytes ? `, ${(dc.webSvgSizeBytes / 1024).toFixed(1)} KB` : ""}`,
        });
      } else if (dc.webSvgValidation) {
        checks.push({
          label: "Web SVG",
          status: "fail",
          detail: dc.webSvgValidation.errors.join("; "),
        });
      } else {
        checks.push({
          label: "Web SVG",
          status: "pass",
          detail: "Found",
        });
      }
    } else {
      checks.push({
        label: "Web SVG",
        status: "fail",
        detail: "Could not fetch from logo URL",
      });
    }
  }

  if (dc.svgMatch === true) {
    checks.push({
      label: "Logo Match",
      status: "pass",
      detail: "Certificate and web SVGs match",
    });
  } else if (dc.svgMatch === false) {
    checks.push({
      label: "Logo Match",
      status: "fail",
      detail: "Certificate and web SVGs differ",
    });
  }

  return checks;
}

function RevocationStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "good":
      return <Badge className="bg-emerald-600 hover:bg-emerald-700">Good</Badge>;
    case "revoked":
      return <Badge variant="destructive">Revoked</Badge>;
    case "unknown":
      return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white">Unknown</Badge>;
    case "error":
      return <Badge variant="secondary">Error</Badge>;
    default:
      return <Badge variant="secondary">Not Available</Badge>;
  }
}

function RevocationStatusCard({
  revocation,
  loading,
  onRecheck,
  error,
}: {
  revocation: RevocationResult | null;
  loading: boolean;
  onRecheck: () => void;
  error: string | null;
}) {
  const hasAnyData = revocation?.ocsp || revocation?.crl;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Revocation Status</CardTitle>
        <Button variant="outline" size="sm" onClick={onRecheck} disabled={loading}>
          {loading ? "Checking..." : "Re-check"}
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-destructive text-sm mb-3">{error}</p>}
        {loading && !revocation ? (
          <p className="text-sm text-muted-foreground">Checking OCSP and CRL status...</p>
        ) : !hasAnyData ? (
          <p className="text-sm text-muted-foreground">
            No OCSP or CRL endpoints found in this certificate&apos;s extensions.
          </p>
        ) : (
          <div className="grid gap-4">
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">OCSP</span>
                {revocation?.ocsp ? (
                  <RevocationStatusBadge status={revocation.ocsp.status} />
                ) : (
                  <span className="text-xs text-muted-foreground">No endpoint in cert</span>
                )}
              </div>
              {revocation?.ocsp && (
                <div className="space-y-1 text-xs">
                  <div className="text-muted-foreground font-mono break-all">{revocation.ocsp.url}</div>
                  {revocation.ocsp.thisUpdate && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground shrink-0">This Update:</span>
                      <UtcTime date={revocation.ocsp.thisUpdate} showTime />
                    </div>
                  )}
                  {revocation.ocsp.nextUpdate && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground shrink-0">Next Update:</span>
                      <UtcTime date={revocation.ocsp.nextUpdate} showTime />
                    </div>
                  )}
                  {revocation.ocsp.errorMessage && (
                    <div className="text-destructive">{revocation.ocsp.errorMessage}</div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">CRL</span>
                {revocation?.crl ? (
                  <RevocationStatusBadge status={revocation.crl.status} />
                ) : (
                  <span className="text-xs text-muted-foreground">No endpoint in cert</span>
                )}
              </div>
              {revocation?.crl && (
                <div className="space-y-1 text-xs">
                  <div className="text-muted-foreground font-mono break-all">{revocation.crl.url}</div>
                  {revocation.crl.thisUpdate && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground shrink-0">This Update:</span>
                      <UtcTime date={revocation.crl.thisUpdate} showTime />
                    </div>
                  )}
                  {revocation.crl.nextUpdate && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground shrink-0">Next Update:</span>
                      <UtcTime date={revocation.crl.nextUpdate} showTime />
                    </div>
                  )}
                  {revocation.crl.errorMessage && <div className="text-destructive">{revocation.crl.errorMessage}</div>}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface SvgValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function LogoComparison({
  certSvg,
  certSvgSizeBytes,
  certSvgValidation,
  logoUrl,
  webSvgSizeBytes,
  webSvgValidation,
  webSvgSource,
  svgMatch,
  showDiff,
  onToggleDiff,
}: {
  certSvg: string;
  certSvgSizeBytes: number | null;
  certSvgValidation: SvgValidation | null;
  logoUrl: string | null;
  webSvgSizeBytes: number | null;
  webSvgValidation: SvgValidation | null;
  webSvgSource: string | null;
  svgMatch: boolean | null;
  showDiff: boolean;
  onToggleDiff: () => void;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Logo Comparison</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium">Cert SVG</span>
            {certSvgValidation && (
              <Badge variant={certSvgValidation.valid ? "default" : "destructive"} className="text-xs px-1.5 py-0">
                {certSvgValidation.valid ? "Valid" : `${certSvgValidation.errors.length} err`}
              </Badge>
            )}
          </div>
          <div className="aspect-square rounded-md border bg-background p-2 overflow-hidden">
            <LogoSvg svg={certSvg} alt="Certificate SVG" className="h-full w-full" />
          </div>
          <span className="text-xs text-muted-foreground mt-1 block text-center">
            {certSvgSizeBytes ? `${(certSvgSizeBytes / 1024).toFixed(1)} KB` : ""}
          </span>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <span className="text-xs font-medium">Web SVG</span>
            <div className="flex items-center gap-1">
              {svgMatch === true && (
                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-xs px-1.5 py-0">Match</Badge>
              )}
              {svgMatch === false && (
                <Badge variant="destructive" className="text-xs px-1.5 py-0">
                  Mismatch
                </Badge>
              )}
              {webSvgValidation && (
                <Badge variant={webSvgValidation.valid ? "default" : "destructive"} className="text-xs px-1.5 py-0">
                  {webSvgValidation.valid ? "Valid" : `${webSvgValidation.errors.length} err`}
                </Badge>
              )}
            </div>
          </div>
          <div className="relative flex aspect-square items-center justify-center rounded-md border bg-background p-2 overflow-hidden">
            {logoUrl && (
              <Image
                src={`/api/proxy/svg?url=${encodeURIComponent(logoUrl)}`}
                alt="Web BIMI logo"
                className="object-contain p-2"
                fill
                sizes="(max-width: 768px) 40vw, 200px"
                unoptimized
              />
            )}
          </div>
          <span className="text-xs text-muted-foreground mt-1 block text-center">
            {webSvgSizeBytes ? `${(webSvgSizeBytes / 1024).toFixed(1)} KB` : ""}
          </span>
        </div>
      </div>
      {svgMatch === false && webSvgSource && (
        <div className="mt-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs focus-visible:ring-2 focus-visible:ring-offset-2"
            onClick={onToggleDiff}
          >
            {showDiff ? "Hide Diff" : "View Diff"}
          </Button>
          {showDiff && (
            <div className="mt-2">
              <SVGDiffViewer certSvg={certSvg} webSvg={webSvgSource} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SVGDiffViewer({ certSvg, webSvg }: { certSvg: string; webSvg: string }) {
  const certLines = certSvg.split("\n");
  const webLines = webSvg.split("\n");

  const diff = computeDiff(certLines, webLines);

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-1.5">
        <span className="text-xs font-medium">SVG Source Diff</span>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500/20 border border-red-500/40" />
            Certificate
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500/40" />
            Web
          </span>
        </div>
      </div>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <pre className="text-xs leading-5">
          {diff.map((line, i) => (
            <div
              key={i}
              className={
                line.type === "removed"
                  ? "bg-red-500/10 text-red-700 dark:text-red-300"
                  : line.type === "added"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "text-muted-foreground/60"
              }
            >
              <span className="inline-block w-8 text-right pr-2 select-none opacity-40 border-r border-border mr-2">
                {line.certLineNo ?? ""}
              </span>
              <span className="inline-block w-8 text-right pr-2 select-none opacity-40 border-r border-border mr-2">
                {line.webLineNo ?? ""}
              </span>
              <span className="select-none opacity-50 mr-1">
                {line.type === "removed" ? "−" : line.type === "added" ? "+" : " "}
              </span>
              {line.text}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

export function CertificateBimiPanel({ id, data }: { id: string; data: CertificateBimiData }) {
  const cert = data.certificate;

  const [bimiCheck, setBimiCheck] = useState<BimiCheckResult | null>(null);
  const [bimiLoading, setBimiLoading] = useState(false);
  const [bimiError, setBimiError] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState<string | null>(null);

  const [revocation, setRevocation] = useState<RevocationResult | null>(null);
  const [revocationLoading, setRevocationLoading] = useState(false);
  const [revocationError, setRevocationError] = useState<string | null>(null);

  const runBimiCheck = useCallback(() => {
    setBimiLoading(true);
    setBimiError(null);
    fetch(`/api/certificates/${id}/bimi-check`)
      .then((res) => {
        if (!res.ok) throw new Error(`BIMI check failed (${res.status})`);
        return res.json();
      })
      .then(setBimiCheck)
      .catch((err) => setBimiError(errorMessage(err)))
      .finally(() => setBimiLoading(false));
  }, [id]);

  const runRevocationCheck = useCallback(() => {
    setRevocationLoading(true);
    setRevocationError(null);
    fetch(`/api/certificates/${id}/revocation`)
      .then((res) => {
        if (!res.ok) throw new Error(`Revocation check failed (${res.status})`);
        return res.json();
      })
      .then(setRevocation)
      .catch((err) => setRevocationError(errorMessage(err)))
      .finally(() => setRevocationLoading(false));
  }, [id]);

  useEffect(() => {
    runBimiCheck();
    runRevocationCheck();
  }, [runBimiCheck, runRevocationCheck]);

  return (
    <>
      {/* Embedded Logo + Revocation Status side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        {cert.logotypeSvg && (
          <Card className="self-start">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Embedded Logo</CardTitle>
              <div className="flex items-center gap-2">
                {bimiCheck?.certSvgValidation && (
                  <Badge variant={bimiCheck.certSvgValidation.valid ? "default" : "destructive"}>
                    SVG {bimiCheck.certSvgValidation.valid ? "Valid" : "Invalid"}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                <LogoCard
                  svg={cert.logotypeSvg}
                  size="md"
                  fingerprint={cert.fingerprintSha256}
                  showShare
                  className="shrink-0 [&>div:first-child]:h-32 [&>div:first-child]:w-32 sm:[&>div:first-child]:h-40 sm:[&>div:first-child]:w-40"
                />
                <div className="flex-1 min-w-0 space-y-3">
                  {bimiCheck?.certSvgSizeBytes && (
                    <Row label="Size" value={`${(bimiCheck.certSvgSizeBytes / 1024).toFixed(1)} KB`} />
                  )}
                  {cert.logotypeSvgHash && <Row label="SVG Hash" value={cert.logotypeSvgHash} mono />}
                  {bimiCheck?.certSvgValidation && (
                    <>
                      {bimiCheck.certSvgValidation.errors.length > 0 && (
                        <div>
                          <span className="text-sm font-medium text-destructive">Errors:</span>
                          <ul className="mt-1 list-disc pl-5 text-sm text-destructive">
                            {bimiCheck.certSvgValidation.errors.map((e, i) => (
                              <li key={i}>{e}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {bimiCheck.certSvgValidation.warnings.length > 0 && (
                        <div>
                          <span className="text-sm font-medium text-yellow-600 dark:text-yellow-400">Warnings:</span>
                          <ul className="mt-1 list-disc pl-5 text-sm text-yellow-600 dark:text-yellow-400">
                            {bimiCheck.certSvgValidation.warnings.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {bimiCheck.certSvgValidation.valid && bimiCheck.certSvgValidation.warnings.length === 0 && (
                        <p className="text-sm text-emerald-600 dark:text-emerald-400">Passes all SVG Tiny PS checks</p>
                      )}
                    </>
                  )}
                </div>
              </div>

              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                  View SVG source
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs font-mono">
                  {cert.logotypeSvg}
                </pre>
              </details>
            </CardContent>
          </Card>
        )}

        <div className="self-start">
          <RevocationStatusCard
            revocation={revocation}
            loading={revocationLoading}
            onRecheck={runRevocationCheck}
            error={revocationError}
          />
        </div>
      </div>

      {bimiError && <p className="text-destructive text-sm">{bimiError}</p>}

      {bimiCheck && bimiCheck.domains.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>BIMI Domain Analysis</CardTitle>
            <Button variant="outline" size="sm" onClick={runBimiCheck} disabled={bimiLoading}>
              {bimiLoading ? "Checking..." : "Re-check"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {bimiCheck.domains.map((dc) => {
              const checks = buildBimiChecks(dc, bimiCheck);
              const failCount = checks.filter((c) => c.status === "fail").length;
              return (
                <div key={dc.domain} className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <DomainChip domain={dc.domain} />
                    <Badge
                      variant={failCount === 0 ? "default" : "secondary"}
                      className={
                        failCount === 0
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                      }
                    >
                      {failCount === 0 ? "BIMI Ready" : `${failCount} issue${failCount > 1 ? "s" : ""}`}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
                    <div className="rounded-md border bg-muted/30 p-3 min-w-0">
                      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Requirements
                      </h4>
                      <div className="divide-y divide-border">
                        {checks.map((check) => (
                          <div key={check.label} className="flex items-start gap-3 py-2">
                            <span className="mt-0.5 shrink-0">
                              {check.status === "pass" ? (
                                <svg
                                  className="size-4 text-emerald-400"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                  <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                              ) : check.status === "warn" ? (
                                <svg
                                  className="size-4 text-amber-400"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                                  <line x1="12" y1="9" x2="12" y2="13" />
                                  <line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                              ) : (
                                <svg
                                  className="size-4 text-red-400"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="15" y1="9" x2="9" y2="15" />
                                  <line x1="9" y1="9" x2="15" y2="15" />
                                </svg>
                              )}
                            </span>
                            <span className="w-32 shrink-0 text-sm text-muted-foreground">{check.label}</span>
                            <span className="text-sm">{check.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {dc.webSvgFound && cert.logotypeSvg && (
                      <LogoComparison
                        certSvg={cert.logotypeSvg}
                        certSvgSizeBytes={bimiCheck.certSvgSizeBytes}
                        certSvgValidation={bimiCheck.certSvgValidation}
                        logoUrl={dc.logoUrl}
                        webSvgSizeBytes={dc.webSvgSizeBytes}
                        webSvgValidation={dc.webSvgValidation}
                        webSvgSource={dc.webSvgSource}
                        svgMatch={dc.svgMatch}
                        showDiff={showDiff === dc.domain}
                        onToggleDiff={() => setShowDiff(showDiff === dc.domain ? null : dc.domain)}
                      />
                    )}
                  </div>

                  <div className="rounded-md border bg-muted/30 p-3">
                    <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      DNS Records
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <div className="mb-1 flex items-baseline gap-2">
                          <span className="text-xs font-medium text-muted-foreground">BIMI TXT</span>
                          <span className="font-mono text-xs text-muted-foreground/70">default._bimi.{dc.domain}</span>
                        </div>
                        <pre className="overflow-x-auto rounded-md bg-background p-2.5 font-mono text-xs text-foreground whitespace-pre-wrap break-all">
                          {dc.bimiRecord ?? "No record found"}
                        </pre>
                      </div>
                      <div>
                        <div className="mb-1 flex items-baseline gap-2">
                          <span className="text-xs font-medium text-muted-foreground">DMARC TXT</span>
                          <span className="font-mono text-xs text-muted-foreground/70">_dmarc.{dc.domain}</span>
                        </div>
                        <pre className="overflow-x-auto rounded-md bg-background p-2.5 font-mono text-xs text-foreground whitespace-pre-wrap break-all">
                          {dc.dmarcRecord ?? "No record found"}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {dc.logoUrl && !dc.webSvgFound && (
                    <p className="text-sm text-muted-foreground">Could not fetch web SVG from {dc.logoUrl}</p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </>
  );
}
