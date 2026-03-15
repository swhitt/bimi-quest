"use client";

import { formatDistanceToNow } from "date-fns";
import { HelpCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { DomainChip } from "@/components/domain-chip";
import { LogoCard } from "@/components/logo-card";
import { OrgChip } from "@/components/org-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalArrowIcon } from "@/components/ui/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatUtcFull, UtcTime } from "@/components/ui/utc-time";
import { certUrl, domainUrl } from "@/lib/entity-urls";
import { getMarkTypeInfo } from "@/lib/mark-types";
import { Row } from "./cert-row";
import type { CertificateHeaderData } from "./certificate-types";
import { formatSerial } from "./certificate-types";

export function CertificateHeader({ data }: { data: CertificateHeaderData }) {
  const cert = data.certificate;
  const isExpired = new Date(cert.notAfter) < new Date();
  const notYetValid = new Date(cert.notBefore) > new Date();

  const [copied, setCopied] = useState<string | null>(null);
  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  return (
    <>
      <BreadcrumbNav
        items={[
          { label: "Dashboard", href: "/" },
          { label: "Certificates", href: "/certificates" },
          cert.subjectOrg
            ? {
                label: cert.subjectOrg,
                node: <OrgChip org={cert.subjectOrg} compact className="text-foreground" />,
              }
            : {
                label: cert.subjectCn || cert.sanList[0] || `#${cert.id}`,
              },
        ]}
      />

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
              {cert.sanList[0] ? <DomainChip domain={cert.sanList[0]} size="sm" /> : cert.subjectCn}
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
              Expired{" "}
              {formatDistanceToNow(new Date(cert.notAfter), {
                addSuffix: true,
              })}
            </Badge>
          ) : notYetValid ? (
            <Badge variant="secondary" title={formatUtcFull(cert.notBefore)}>
              Valid{" "}
              {formatDistanceToNow(new Date(cert.notBefore), {
                addSuffix: true,
              })}
            </Badge>
          ) : (
            <Badge className="bg-emerald-600 hover:bg-emerald-700" title={formatUtcFull(cert.notAfter)}>
              Expires{" "}
              {formatDistanceToNow(new Date(cert.notAfter), {
                addSuffix: true,
              })}
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
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-secondary"
            onClick={() => {
              const el = document.getElementById("lint");
              if (el) {
                if (el instanceof HTMLDetailsElement && !el.open) el.open = true;
                el.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }}
          >
            Lint
          </button>
          <Link
            href={`/tools/asn1?cert=${cert.fingerprintSha256}`}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-secondary"
          >
            ASN.1
          </Link>
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
              className="h-8 px-2 text-xs shrink-0"
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
                          <DomainChip domain={san} showBimiCheck />
                          <Link
                            href={domainUrl(san)}
                            className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
                            title={`BIMI DNS for ${san}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg
                              className="size-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <circle cx="12" cy="12" r="10" />
                              <path d="M2 12h20" />
                              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                            </svg>
                          </Link>
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
    </>
  );
}
