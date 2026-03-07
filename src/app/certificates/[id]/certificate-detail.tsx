"use client";

import { formatDistanceToNow } from "date-fns";
import { HelpCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HostChip } from "@/components/host-chip";
import { HostnameLink } from "@/components/hostname-link";
import { LogoCard } from "@/components/logo-card";
import { OrgChip } from "@/components/org-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalArrowIcon } from "@/components/ui/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatUtcFull, UtcTime } from "@/components/ui/utc-time";
import { computeDiff } from "@/lib/diff";
import { certUrl } from "@/lib/entity-urls";
import { getMarkTypeInfo } from "@/lib/mark-types";
import { sanitizeSvg } from "@/lib/sanitize-svg";
import { errorMessage } from "@/lib/utils";
import { decodeExtension } from "@/lib/x509/decode-extensions";

// Extension entry: new format has { v, c }, old format is a plain hex string
type ExtensionValue = string | { v: string; c: boolean };

interface CertData {
  certificate: {
    id: number;
    fingerprintSha256: string;
    serialNumber: string;
    isPrecert: boolean;
    notBefore: string;
    notAfter: string;
    subjectDn: string;
    subjectCn: string | null;
    subjectOrg: string | null;
    subjectCountry: string | null;
    subjectState: string | null;
    subjectLocality: string | null;
    issuerDn: string;
    issuerCn: string | null;
    issuerOrg: string | null;
    sanList: string[];
    markType: string | null;
    certType: string | null;
    logotypeSvg: string | null;
    logotypeSvgHash: string | null;
    rawPem: string;
    ctLogTimestamp: string | null;
    ctLogIndex: string | null;
    extensionsJson: Record<string, ExtensionValue> | null;
    crtshId: string | null;
    notabilityScore: number | null;
    notabilityReason: string | null;
    companyDescription: string | null;
    industry: string | null;
  };
  pairedCert: {
    id: number;
    isPrecert: boolean;
    fingerprintSha256: string;
    ctLogIndex: string | null;
    ctLogTimestamp: string | null;
    extensionsJson: Record<string, ExtensionValue> | null;
  } | null;
  chain: {
    id: number;
    chainPosition: number;
    fingerprintSha256: string;
    subjectDn: string;
    issuerDn: string;
    notBefore: string | null;
    notAfter: string | null;
    rawPem: string;
    serialNumber: string | null;
    subjectOrg: string | null;
    issuerOrg: string | null;
  }[];
  bimiStates: {
    domain: string;
    bimiRecordRaw: string | null;
    bimiLogoUrl: string | null;
    dmarcPolicy: string | null;
    dmarcValid: boolean | null;
    svgTinyPsValid: boolean | null;
  }[];
  sanCertCounts: Record<string, number>;
}

interface RevocationCheck {
  url: string;
  status: "good" | "revoked" | "unknown" | "error";
  thisUpdate?: string;
  nextUpdate?: string;
  errorMessage?: string;
}

interface RevocationResult {
  ocsp: RevocationCheck | null;
  crl: (Omit<RevocationCheck, "status"> & { status: "good" | "revoked" | "error" }) | null;
}

interface BimiCheckResult {
  certSvgValidation: { valid: boolean; errors: string[]; warnings: string[] } | null;
  certValidity: {
    isExpired: boolean;
    isNotYetValid: boolean;
    daysRemaining: number;
    markType: string | null;
    certType: string | null;
  };
  certSvgHash: string | null;
  certSvgSizeBytes: number | null;
  domains: {
    domain: string;
    bimiRecord: string | null;
    dmarcRecord: string | null;
    logoUrl: string | null;
    authorityUrl: string | null;
    dmarcPolicy: string | null;
    dmarcValid: boolean | null;
    webSvgFound: boolean;
    webSvgValidation: { valid: boolean; errors: string[]; warnings: string[] } | null;
    webSvgSizeBytes: number | null;
    svgMatch: boolean | null;
    webSvgSource: string | null;
  }[];
}

function chainLabel(chainCert: { chainPosition: number; subjectDn: string; issuerDn: string }): string {
  // Self-signed cert (subject matches issuer) is a root CA
  if (chainCert.subjectDn === chainCert.issuerDn) return "Root CA";
  if (chainCert.chainPosition === 1) return "Intermediate CA";
  return `Intermediate CA (${chainCert.chainPosition})`;
}

export function CertificateDetail({ id }: { id: string }) {
  const [data, setData] = useState<CertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPem, setShowPem] = useState(false);
  const [bimiCheck, setBimiCheck] = useState<BimiCheckResult | null>(null);
  const [bimiLoading, setBimiLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState<string | null>(null);
  const [revocation, setRevocation] = useState<RevocationResult | null>(null);
  const [revocationLoading, setRevocationLoading] = useState(false);
  const [bimiError, setBimiError] = useState<string | null>(null);
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
    fetch(`/api/certificates/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Certificate not found");
        return res.json();
      })
      .then((d) => {
        setData(d);
        // Kick off secondary checks from the async callback (not synchronous in effect body)
        runBimiCheck();
        runRevocationCheck();
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, runBimiCheck, runRevocationCheck]);

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const logotypeSvg = data?.certificate.logotypeSvg ?? null;
  const sanitizedSvg = useMemo<string | null>(() => (logotypeSvg ? sanitizeSvg(logotypeSvg) : null), [logotypeSvg]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading certificate...</div>;
  }

  if (error || !data) {
    return (
      <div className="flex h-64 items-center justify-center text-destructive">{error || "Certificate not found"}</div>
    );
  }

  const cert = data.certificate;
  const isExpired = new Date(cert.notAfter) < new Date();
  const notYetValid = new Date(cert.notBefore) > new Date();

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-foreground">
          Dashboard
        </Link>
        <span>/</span>
        <Link href="/certificates" className="hover:text-foreground">
          Certificates
        </Link>
        <span>/</span>
        {cert.subjectOrg ? (
          <OrgChip org={cert.subjectOrg} compact className="text-foreground" />
        ) : (
          <span className="text-foreground">{cert.subjectCn || cert.sanList[0] || `#${cert.id}`}</span>
        )}
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {cert.logotypeSvg && (
            <LogoCard
              svg={cert.logotypeSvg}
              size="sm"
              fingerprint={cert.fingerprintSha256}
              className="shrink-0 [&>div]:size-16 [&>div]:p-1.5 [&>div]:rounded-lg"
            />
          )}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {cert.subjectOrg || cert.subjectCn || cert.sanList[0] || "Certificate"}
            </h1>
            <p className="text-muted-foreground flex items-center gap-1">
              {cert.sanList[0] ? <HostnameLink hostname={cert.sanList[0]} size="sm" /> : cert.subjectCn}
              {cert.subjectCountry && ` · ${cert.subjectCountry}`}
              {cert.issuerOrg && ` · Issued by ${cert.issuerOrg}`}
            </p>
            {cert.companyDescription && (
              <p className="text-sm text-muted-foreground/70 mt-0.5">{cert.companyDescription}</p>
            )}
            {cert.notabilityScore != null && (
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    cert.notabilityScore >= 8
                      ? "bg-amber-500/15 text-amber-500"
                      : cert.notabilityScore >= 5
                        ? "bg-blue-500/15 text-blue-500"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {"★".repeat(Math.round(cert.notabilityScore / 2))} {cert.notabilityScore}/10
                </span>
                {cert.industry && (
                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {cert.industry}
                  </span>
                )}
                {cert.notabilityReason && (
                  <span className="text-xs text-muted-foreground">{cert.notabilityReason}</span>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="size-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-64">
                    Reflects the organization&apos;s global brand recognition and email volume (1-10). Higher scores
                    indicate more widely recognized brands.
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap shrink-0 items-center gap-2">
          {cert.isPrecert && (
            <Badge variant="secondary" className="text-amber-600 dark:text-amber-400" title="This is a precertificate">
              Precert
            </Badge>
          )}
          {isExpired ? (
            <Badge variant="destructive" title={formatUtcFull(cert.notAfter)}>
              Expired {formatDistanceToNow(new Date(cert.notAfter), { addSuffix: true })}
            </Badge>
          ) : notYetValid ? (
            <Badge variant="secondary" title={formatUtcFull(cert.notBefore)}>
              Valid {formatDistanceToNow(new Date(cert.notBefore), { addSuffix: true })}
            </Badge>
          ) : (
            <Badge className="bg-emerald-600 hover:bg-emerald-700" title={formatUtcFull(cert.notAfter)}>
              Expires {formatDistanceToNow(new Date(cert.notAfter), { addSuffix: true })}
            </Badge>
          )}
          {cert.certType && (
            <Badge variant="outline">
              <abbr
                title={
                  cert.certType === "VMC"
                    ? "Verified Mark Certificate"
                    : cert.certType === "CMC"
                      ? "Common Mark Certificate"
                      : undefined
                }
                className="no-underline"
              >
                {cert.certType}
              </abbr>
            </Badge>
          )}
          {cert.markType &&
            (() => {
              const mtInfo = getMarkTypeInfo(cert.markType);
              return (
                <Badge variant="secondary" className={mtInfo?.badgeClass ?? ""}>
                  {mtInfo && (
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
                  )}
                  {mtInfo?.label ?? cert.markType}
                </Badge>
              );
            })()}
          {data.pairedCert && (
            <Link
              href={certUrl(data.pairedCert.fingerprintSha256)}
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-secondary ${cert.isPrecert ? "border-amber-500/40 text-amber-700 dark:text-amber-300" : "border-blue-500/40 text-blue-700 dark:text-blue-300"}`}
            >
              {cert.isPrecert ? "View Final Cert" : "View Precert"}
            </Link>
          )}
          <a
            href={`https://crt.sh/?q=${cert.fingerprintSha256}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-secondary"
          >
            crt.sh
            <ExternalArrowIcon />
          </a>
          {data.pairedCert && (
            <a
              href={`https://crt.sh/?q=${data.pairedCert.fingerprintSha256}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              crt.sh {cert.isPrecert ? "Final" : "Precert"}
              <ExternalArrowIcon />
            </a>
          )}
        </div>
      </div>

      {/* Certificate Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Certificate Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <span className="sm:w-40 sm:shrink-0 text-muted-foreground">Fingerprint (SHA-256)</span>
            <code className="break-all text-xs font-mono flex-1 min-w-0">{cert.fingerprintSha256}</code>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs shrink-0"
              onClick={() => copyToClipboard(cert.fingerprintSha256, "fingerprint")}
            >
              {copied === "fingerprint" ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-3">
              <Row label="Serial Number" value={formatSerial(cert.serialNumber)} mono />
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <span className="sm:w-40 sm:shrink-0 text-muted-foreground">Issued</span>
                <UtcTime date={cert.notBefore} />
              </div>
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <span className="sm:w-40 sm:shrink-0 text-muted-foreground">Expires</span>
                <UtcTime date={cert.notAfter} expired={isExpired} />
              </div>
            </div>
            <div className="space-y-3">
              <Row label="Intermediate CA" value={cert.issuerOrg || cert.issuerCn} />
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <span className="sm:w-40 sm:shrink-0 text-muted-foreground">Subject</span>
                <span className="break-all">
                  {cert.subjectOrg ? (
                    <>
                      <OrgChip org={cert.subjectOrg} compact className="text-primary" />
                      {cert.subjectCountry && `, ${cert.subjectCountry}`}
                    </>
                  ) : (
                    cert.subjectCn
                  )}
                </span>
              </div>
              {cert.sanList.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:gap-4">
                  <span className="sm:w-40 sm:shrink-0 text-muted-foreground">SANs</span>
                  <span className="break-all">
                    {cert.sanList.map((san, i) => {
                      const otherCount = data.sanCertCounts?.[san] ?? 0;
                      const totalCount = otherCount > 0 ? otherCount + 1 : 0;
                      return (
                        <span key={san} className="inline-flex items-center">
                          {i > 0 && <span className="mx-1 text-muted-foreground">,</span>}
                          <HostChip hostname={san} showBimiCheck />
                          {totalCount > 1 && (
                            <span className="text-xs text-muted-foreground font-normal ml-1">· {totalCount} certs</span>
                          )}
                        </span>
                      );
                    })}
                  </span>
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <span className="sm:w-40 sm:shrink-0 text-muted-foreground">CT Log</span>
                <span>
                  Gorgon (DigiCert)
                  {cert.ctLogIndex && (
                    <Link
                      href={`/ct/gorgon/${cert.ctLogIndex}`}
                      className="text-muted-foreground hover:text-foreground hover:underline transition-colors"
                    >
                      {" "}
                      #{cert.ctLogIndex}
                    </Link>
                  )}
                  {cert.ctLogTimestamp && (
                    <span className="text-muted-foreground">
                      {" · "}
                      <UtcTime date={cert.ctLogTimestamp} showTime />
                      <span> ({formatDistanceToNow(new Date(cert.ctLogTimestamp), { addSuffix: true })})</span>
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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

              {/* SVG source (collapsed) */}
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

        {/* Revocation Status */}
        <div className="self-start">
          <RevocationStatusCard
            revocation={revocation}
            loading={revocationLoading}
            onRecheck={runRevocationCheck}
            error={revocationError}
          />
        </div>
      </div>

      {/* BIMI error */}
      {bimiError && <p className="text-destructive text-sm">{bimiError}</p>}

      {/* BIMI Domain Analysis - full width */}
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
                    <HostnameLink hostname={dc.domain} />
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

                  {/* Requirements + Logo Comparison side by side */}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
                    {/* Requirements checklist */}
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
                        certSvgHtml={sanitizedSvg!}
                        certSvgSizeBytes={bimiCheck.certSvgSizeBytes}
                        certSvgValidation={bimiCheck.certSvgValidation}
                        certSvgSource={cert.logotypeSvg}
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

                  {/* DNS Records */}
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

      {/* Certificate Details - parsed X.509 fields */}
      <Card>
        <CardHeader>
          <CardTitle>Certificate Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-mono text-sm space-y-0.5 overflow-x-auto">
            <CertLine label="Serial Number" value={formatSerial(cert.serialNumber)} indent={2} />
            <div className="pt-1" />
            <CertSection title="Issuer" indent={2}>
              {cert.issuerCn && <CertLine label="commonName" value={cert.issuerCn} indent={3} />}
              {cert.issuerOrg && <CertLine label="organizationName" value={cert.issuerOrg} indent={3} />}
            </CertSection>
            <div className="pt-1" />
            <CertSection title="Validity" indent={2}>
              <CertLine label="Not Before" value={formatCertDate(cert.notBefore)} indent={3} />
              <CertLine
                label="Not After"
                value={formatCertDate(cert.notAfter)}
                indent={3}
                highlight={isExpired ? "destructive" : undefined}
              />
            </CertSection>
            <div className="pt-1" />
            <CertSection title="Subject" indent={2}>
              {cert.subjectCn && <CertLine label="commonName" value={cert.subjectCn} indent={3} />}
              {cert.subjectOrg && <CertLine label="organizationName" value={cert.subjectOrg} indent={3} />}
              {cert.subjectCountry && <CertLine label="countryName" value={cert.subjectCountry} indent={3} />}
              {cert.subjectState && <CertLine label="stateOrProvinceName" value={cert.subjectState} indent={3} />}
              {cert.subjectLocality && <CertLine label="localityName" value={cert.subjectLocality} indent={3} />}
              {/* BIMI-specific subject fields from the full DN */}
              {parseBimiSubjectFields(cert.subjectDn).map(([oid, val]) => (
                <CertLine key={oid} label={oid} value={val} indent={3} />
              ))}
            </CertSection>
            {cert.sanList.length > 0 && (
              <>
                <div className="pt-1" />
                <CertSection title="Subject Alternative Names" indent={2}>
                  {cert.sanList.map((san) => {
                    const otherCount = data.sanCertCounts[san] ?? 0;
                    const totalCount = otherCount > 0 ? otherCount + 1 : 0;
                    return (
                      <div key={san} className="pl-[3.5rem] flex items-center gap-1">
                        <span className="text-muted-foreground">DNS:</span>
                        <HostnameLink hostname={san} />
                        {totalCount > 1 && (
                          <span className="text-xs text-muted-foreground font-normal">· {totalCount} certs</span>
                        )}
                      </div>
                    );
                  })}
                </CertSection>
              </>
            )}
            {cert.extensionsJson && Object.keys(cert.extensionsJson).length > 0 && (
              <>
                <div className="pt-1" />
                <CertSection title="X509v3 Extensions" indent={2}>
                  {Object.entries(cert.extensionsJson).map(([oid, value]) => {
                    const hexStr =
                      typeof value === "string"
                        ? value
                        : typeof value === "object" && value && "v" in value
                          ? (value as { v: string }).v
                          : JSON.stringify(value);
                    const isCritical =
                      typeof value === "object" && value && "c" in value ? (value as { c: boolean }).c : false;
                    const ext = decodeExtension(oid, hexStr);
                    const displayName = ext.name !== "Unknown" ? ext.name : oid;
                    const showOid = ext.name !== "Unknown";
                    return (
                      <div key={oid} className="pl-[3.5rem] py-0.5">
                        <span className="text-muted-foreground">
                          {displayName}
                          {showOid && <span className="text-muted-foreground font-mono text-xs ml-1">({oid})</span>}:
                        </span>
                        {isCritical && (
                          <Badge variant="destructive" className="ml-1.5 text-[10px] px-1 py-0 h-4 align-text-top">
                            Critical
                          </Badge>
                        )}
                        {ext.decoded ? (
                          <span className="ml-2 whitespace-pre-wrap break-all">{ext.decoded}</span>
                        ) : (
                          <span className="ml-2 text-muted-foreground/60 break-all">
                            {hexStr.substring(0, 64)}
                            {hexStr.length > 64 ? "..." : ""}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </CertSection>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Certificate Chain */}
      {data.chain.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Certificate Chain</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {/* Vertical connector line */}
              <div className="absolute left-4 top-6 bottom-6 w-px bg-border" />

              <div className="space-y-0">
                {/* Leaf cert */}
                <div className="relative pl-10 pb-4">
                  <div className="absolute left-2.5 top-3 z-10 flex h-3 w-3 items-center justify-center rounded-full border-2 border-primary bg-background" />
                  <div className="rounded-lg border-2 border-primary/50 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Leaf Certificate</span>
                        {cert.subjectOrg && (
                          <OrgChip org={cert.subjectOrg} size="sm" compact className="text-muted-foreground" />
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        Position 0
                      </Badge>
                    </div>
                    <div className="mt-1.5 grid gap-1 text-xs">
                      <div>
                        <span className="text-muted-foreground">Subject:</span>{" "}
                        <span className="break-all">{cert.subjectDn}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Issuer:</span>{" "}
                        <span className="break-all">{cert.issuerDn}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Serial:</span>{" "}
                        <span className="font-mono">{formatSerial(cert.serialNumber)}</span>
                      </div>
                    </div>
                    <CopyableFingerprint value={cert.fingerprintSha256} copied={copied} onCopy={copyToClipboard} />
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <UtcTime date={cert.notBefore} /> <span>–</span> <UtcTime date={cert.notAfter} />
                    </div>
                  </div>
                </div>

                {/* Chain certs */}
                {data.chain.map((c, idx) => {
                  const label = chainLabel(c);
                  const isRoot = c.subjectDn === c.issuerDn;
                  const isLast = idx === data.chain.length - 1;
                  return (
                    <div key={c.id} className={`relative pl-10 ${isLast ? "" : "pb-4"}`}>
                      <div
                        className={`absolute left-2.5 top-3 z-10 flex h-3 w-3 items-center justify-center rounded-full border-2 bg-background ${isRoot ? "border-amber-500" : "border-muted-foreground"}`}
                      />
                      <div className={`rounded-lg border p-3 ${isRoot ? "border-amber-500/50" : ""}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{label}</span>
                            {c.subjectOrg && <span className="text-sm text-muted-foreground">{c.subjectOrg}</span>}
                          </div>
                          <Badge variant="outline" className="text-xs">
                            Position {c.chainPosition}
                          </Badge>
                        </div>
                        <div className="mt-1.5 grid gap-1 text-xs">
                          <div>
                            <span className="text-muted-foreground">Subject:</span>{" "}
                            <span className="break-all">{c.subjectDn}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Issuer:</span>{" "}
                            <span className="break-all">{c.issuerDn}</span>
                          </div>
                          {c.serialNumber && (
                            <div>
                              <span className="text-muted-foreground">Serial:</span>{" "}
                              <span className="font-mono">{formatSerial(c.serialNumber)}</span>
                            </div>
                          )}
                        </div>
                        <CopyableFingerprint value={c.fingerprintSha256} copied={copied} onCopy={copyToClipboard} />
                        {c.notBefore && c.notAfter && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <UtcTime date={c.notBefore} /> <span>–</span> <UtcTime date={c.notAfter} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Raw PEM */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Raw PEM</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowPem(!showPem)}>
              {showPem ? "Hide" : "Show"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => copyToClipboard(cert.rawPem, "pem")}>
              {copied === "pem" ? "Copied" : "Copy PEM"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const blob = new Blob([cert.rawPem], { type: "application/x-pem-file" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${cert.subjectCn || cert.sanList[0] || "certificate"}.pem`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download .pem
            </Button>
          </div>
        </CardHeader>
        {showPem && (
          <CardContent>
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs font-mono whitespace-pre">
              {cert.rawPem}
            </pre>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function buildBimiChecks(
  dc: BimiCheckResult["domains"][number],
  bimiCheck: BimiCheckResult,
): { label: string; status: "pass" | "warn" | "fail"; detail: string }[] {
  const checks: { label: string; status: "pass" | "warn" | "fail"; detail: string }[] = [];

  // 1. BIMI DNS Record
  if (dc.bimiRecord) {
    checks.push({ label: "BIMI Record", status: "pass", detail: "Valid v=BIMI1 record found" });
  } else {
    checks.push({ label: "BIMI Record", status: "fail", detail: `No record at default._bimi.${dc.domain}` });
  }

  // 2. DMARC Policy
  if (dc.dmarcValid === true) {
    checks.push({ label: "DMARC Policy", status: "pass", detail: `${dc.dmarcPolicy} (meets BIMI requirements)` });
  } else if (dc.dmarcValid === false) {
    checks.push({
      label: "DMARC Policy",
      status: "fail",
      detail: dc.dmarcPolicy
        ? `Policy "${dc.dmarcPolicy}" does not meet BIMI requirements (need quarantine or reject)`
        : "No DMARC record found",
    });
  } else {
    checks.push({ label: "DMARC Policy", status: "warn", detail: "Could not check" });
  }

  // 3. Certificate
  const cv = bimiCheck.certValidity;
  if (cv.isExpired) {
    checks.push({
      label: "Certificate",
      status: "fail",
      detail: `${cv.certType ?? "BIMI"} expired ${Math.abs(cv.daysRemaining)} days ago`,
    });
  } else if (cv.isNotYetValid) {
    checks.push({ label: "Certificate", status: "fail", detail: `${cv.certType ?? "BIMI"} not yet valid` });
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

  // 4. Certificate SVG
  if (bimiCheck.certSvgValidation) {
    if (bimiCheck.certSvgValidation.valid) {
      checks.push({ label: "Cert SVG", status: "pass", detail: "Valid SVG Tiny PS" });
    } else {
      checks.push({ label: "Cert SVG", status: "fail", detail: bimiCheck.certSvgValidation.errors.join("; ") });
    }
  }

  // 5. Web SVG
  if (dc.logoUrl) {
    if (dc.webSvgFound) {
      if (dc.webSvgValidation?.valid) {
        checks.push({
          label: "Web SVG",
          status: "pass",
          detail: `Valid${dc.webSvgSizeBytes ? `, ${(dc.webSvgSizeBytes / 1024).toFixed(1)} KB` : ""}`,
        });
      } else if (dc.webSvgValidation) {
        checks.push({ label: "Web SVG", status: "fail", detail: dc.webSvgValidation.errors.join("; ") });
      } else {
        checks.push({ label: "Web SVG", status: "pass", detail: "Found" });
      }
    } else {
      checks.push({ label: "Web SVG", status: "fail", detail: "Could not fetch from logo URL" });
    }
  }

  // 6. Logo match
  if (dc.svgMatch === true) {
    checks.push({ label: "Logo Match", status: "pass", detail: "Certificate and web SVGs match" });
  } else if (dc.svgMatch === false) {
    checks.push({ label: "Logo Match", status: "fail", detail: "Certificate and web SVGs differ" });
  }

  return checks;
}

function Row({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4">
      <span className="sm:w-40 sm:shrink-0 text-muted-foreground">{label}</span>
      <span className={`break-all min-w-0 ${mono ? "font-mono text-xs" : ""}`}>{value || "-"}</span>
    </div>
  );
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
  // Show the card even while loading (with skeleton state)
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
            {/* OCSP */}
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

            {/* CRL */}
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

// Certificate detail formatting helpers

function formatSerial(serial: string): string {
  // Format as colon-separated hex pairs
  const hex = serial.replace(/^0x/i, "").toLowerCase();
  return hex.match(/.{1,2}/g)?.join(":") || serial;
}

function formatCertDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toUTCString().replace("GMT", "UTC");
}

/** Extract BIMI-specific OID fields from the subject DN that aren't standard fields */
function parseBimiSubjectFields(dn: string): [string, string][] {
  const bimiOids: Record<string, string> = {
    "1.3.6.1.4.1.53087.1.2": "BIMI Trademark Office",
    "1.3.6.1.4.1.53087.1.3": "BIMI Trademark Country",
    "1.3.6.1.4.1.53087.1.4": "BIMI Trademark ID",
    "1.3.6.1.4.1.53087.1.13": "BIMI Mark Type",
  };
  const results: [string, string][] = [];
  for (const [oid, label] of Object.entries(bimiOids)) {
    const re = new RegExp(`${oid.replace(/\./g, "\\.")}\\s*=\\s*([^,+]+)`);
    const m = dn.match(re);
    if (m) results.push([label, m[1].trim()]);
  }
  return results;
}

function CertLine({
  label,
  value,
  indent,
  muted,
  highlight,
}: {
  label: string;
  value: string;
  indent: number;
  muted?: boolean;
  highlight?: "destructive";
}) {
  const pad = indent * 1.25;
  return (
    <div style={{ paddingLeft: `${pad}rem` }}>
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span
        className={
          highlight === "destructive" ? "text-destructive font-medium" : muted ? "text-muted-foreground/70" : ""
        }
      >
        {value}
      </span>
    </div>
  );
}

function CertSection({ title, indent, children }: { title: string; indent: number; children: React.ReactNode }) {
  const pad = indent * 1.25;
  return (
    <div>
      <div style={{ paddingLeft: `${pad}rem` }} className="font-medium text-foreground">
        {title}:
      </div>
      {children}
    </div>
  );
}

function CopyableFingerprint({
  value,
  copied,
  onCopy,
}: {
  value: string;
  copied: string | null;
  onCopy: (text: string, label: string) => void;
}) {
  const label = `fp-${value.substring(0, 8)}`;
  return (
    <div className="flex items-center gap-1 mt-1">
      <span className="text-xs text-muted-foreground font-mono">
        SHA-256: {value.substring(0, 16)}...{value.substring(value.length - 8)}
      </span>
      <button
        className="text-xs text-muted-foreground hover:text-foreground underline"
        onClick={() => onCopy(value, label)}
      >
        {copied === label ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

interface SvgValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function LogoComparison({
  certSvgHtml,
  certSvgSizeBytes,
  certSvgValidation,
  certSvgSource,
  logoUrl,
  webSvgSizeBytes,
  webSvgValidation,
  webSvgSource,
  svgMatch,
  showDiff,
  onToggleDiff,
}: {
  certSvgHtml: string;
  certSvgSizeBytes: number | null;
  certSvgValidation: SvgValidation | null;
  certSvgSource: string;
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium">Cert SVG</span>
            {certSvgValidation && (
              <Badge variant={certSvgValidation.valid ? "default" : "destructive"} className="text-xs px-1.5 py-0">
                {certSvgValidation.valid ? "Valid" : `${certSvgValidation.errors.length} err`}
              </Badge>
            )}
          </div>
          <div
            className="flex aspect-square items-center justify-center rounded-md border bg-white p-2 overflow-hidden [&>svg]:max-h-full [&>svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: certSvgHtml }}
          />
          <span className="text-[10px] text-muted-foreground mt-1 block text-center">
            {certSvgSizeBytes ? `${(certSvgSizeBytes / 1024).toFixed(1)} KB` : ""}
          </span>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <span className="text-xs font-medium">Web SVG</span>
            <div className="flex items-center gap-1">
              {svgMatch === true && (
                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px] px-1.5 py-0">Match</Badge>
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
          <div className="relative flex aspect-square items-center justify-center rounded-md border bg-white p-2 overflow-hidden">
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
          <span className="text-[10px] text-muted-foreground mt-1 block text-center">
            {webSvgSizeBytes ? `${(webSvgSizeBytes / 1024).toFixed(1)} KB` : ""}
          </span>
        </div>
      </div>
      {svgMatch === false && webSvgSource && (
        <div className="mt-2">
          <Button variant="outline" size="sm" className="h-6 text-xs" onClick={onToggleDiff}>
            {showDiff ? "Hide Diff" : "View Diff"}
          </Button>
          {showDiff && (
            <div className="mt-2">
              <SVGDiffViewer certSvg={certSvgSource} webSvg={webSvgSource} />
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

  // Simple LCS-based diff
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
