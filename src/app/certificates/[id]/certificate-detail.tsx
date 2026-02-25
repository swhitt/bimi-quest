"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, formatDistanceToNow } from "date-fns";
import { decodeExtension } from "@/lib/x509/decode-extensions";
import { sanitizeSvg } from "@/lib/sanitize-svg";

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
    extensionsJson: Record<string, string> | null;
    crtshId: string | null;
  };
  pairedCert: {
    id: number;
    isPrecert: boolean;
    fingerprintSha256: string;
    ctLogIndex: string | null;
    ctLogTimestamp: string | null;
    extensionsJson: Record<string, string> | null;
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
  }[];
  bimiStates: {
    domain: string;
    bimiRecordRaw: string | null;
    bimiLogoUrl: string | null;
    dmarcPolicy: string | null;
    dmarcValid: boolean | null;
    svgTinyPsValid: boolean | null;
  }[];
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
  const [svgBgDark, setSvgBgDark] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/certificates/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Certificate not found");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const runBimiCheck = useCallback(() => {
    setBimiLoading(true);
    fetch(`/api/certificates/${id}/bimi-check`)
      .then((res) => res.json())
      .then(setBimiCheck)
      .catch(() => {})
      .finally(() => setBimiLoading(false));
  }, [id]);

  // Auto-run BIMI check when data loads
  useEffect(() => {
    if (data) runBimiCheck();
  }, [data, runBimiCheck]);

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading certificate...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-64 items-center justify-center text-destructive">
        {error || "Certificate not found"}
      </div>
    );
  }

  const cert = data.certificate;
  const isExpired = new Date(cert.notAfter) < new Date();
  const notYetValid = new Date(cert.notBefore) > new Date();

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-foreground">Dashboard</Link>
        <span>/</span>
        <Link href="/certificates" className="hover:text-foreground">Certificates</Link>
        <span>/</span>
        <span className="text-foreground">{cert.subjectOrg || cert.subjectCn || cert.sanList[0] || `#${cert.id}`}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {cert.logotypeSvg && (
            <div
              className="h-16 w-16 shrink-0 rounded-lg border bg-white p-1.5 overflow-hidden [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: sanitizeSvg(cert.logotypeSvg) }}
            />
          )}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {cert.subjectOrg || cert.subjectCn || cert.sanList[0] || "Certificate"}
            </h1>
            <p className="text-muted-foreground">
              {cert.sanList[0] || cert.subjectCn}
              {cert.subjectCountry && ` · ${cert.subjectCountry}`}
              {cert.issuerOrg && ` · Issued by ${cert.issuerOrg}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap shrink-0 items-center gap-2">
          {cert.isPrecert && (
            <Badge variant="secondary" className="text-amber-600 dark:text-amber-400" title="This is a precertificate">
              Precert
            </Badge>
          )}
          {isExpired ? (
            <Badge variant="destructive" title={format(new Date(cert.notAfter), "PPP")}>
              Expired {formatDistanceToNow(new Date(cert.notAfter), { addSuffix: true })}
            </Badge>
          ) : notYetValid ? (
            <Badge variant="secondary" title={format(new Date(cert.notBefore), "PPP")}>
              Valid {formatDistanceToNow(new Date(cert.notBefore), { addSuffix: true })}
            </Badge>
          ) : (
            <Badge className="bg-emerald-600 hover:bg-emerald-700" title={format(new Date(cert.notAfter), "PPP")}>
              Expires {formatDistanceToNow(new Date(cert.notAfter), { addSuffix: true })}
            </Badge>
          )}
          {cert.certType && <Badge variant="outline">{cert.certType}</Badge>}
          {cert.markType && <Badge variant="secondary">{cert.markType}</Badge>}
        </div>
      </div>

      {/* Precert/Final cert pairing notice */}
      {data.pairedCert && (
        <Card className={cert.isPrecert ? "border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10" : "border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/10"}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                {cert.isPrecert ? (
                  <>
                    <span className="text-muted-foreground">This is a precertificate. The final certificate is also logged:</span>
                    <Link href={`/certificates/${data.pairedCert.id}`} className="font-medium hover:underline">
                      View final certificate
                    </Link>
                  </>
                ) : (
                  <>
                    <span className="text-muted-foreground">The precertificate for this certificate is also logged:</span>
                    <Link href={`/certificates/${data.pairedCert.id}`} className="font-medium hover:underline">
                      View precertificate
                    </Link>
                  </>
                )}
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                CT #{data.pairedCert.ctLogIndex || "?"}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Logo Section - prominent display with validation */}
      {cert.logotypeSvg && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Embedded Logo</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSvgBgDark(!svgBgDark)}
              >
                {svgBgDark ? "Light BG" : "Dark BG"}
              </Button>
              {bimiCheck?.certSvgValidation && (
                <Badge variant={bimiCheck.certSvgValidation.valid ? "default" : "destructive"}>
                  SVG {bimiCheck.certSvgValidation.valid ? "Valid" : "Invalid"}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              {/* Large SVG preview */}
              <div
                className={`flex h-40 w-40 shrink-0 items-center justify-center rounded-lg border p-3 ${
                  svgBgDark ? "bg-zinc-900" : "bg-white"
                }`}
                dangerouslySetInnerHTML={{ __html: sanitizeSvg(cert.logotypeSvg) }}
              />
              <div className="flex-1 space-y-3">
                {bimiCheck?.certSvgSizeBytes && (
                  <Row label="Size" value={`${(bimiCheck.certSvgSizeBytes / 1024).toFixed(1)} KB`} />
                )}
                {cert.logotypeSvgHash && (
                  <Row label="SVG Hash" value={cert.logotypeSvgHash} mono />
                )}
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
                      <p className="text-sm text-emerald-600 dark:text-emerald-400">
                        Passes all SVG Tiny PS checks
                      </p>
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

      {/* BIMI Domain Analysis */}
      {bimiCheck && bimiCheck.domains.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>BIMI Domain Analysis</CardTitle>
            <Button variant="outline" size="sm" onClick={runBimiCheck} disabled={bimiLoading}>
              {bimiLoading ? "Checking..." : "Re-check"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {bimiCheck.domains.map((dc) => (
              <div key={dc.domain} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{dc.domain}</span>
                  <div className="flex gap-2">
                    {dc.bimiRecord ? (
                      <Badge variant="outline">BIMI Record Found</Badge>
                    ) : (
                      <Badge variant="destructive">No BIMI Record</Badge>
                    )}
                    {dc.dmarcValid === true && <Badge>DMARC OK</Badge>}
                    {dc.dmarcValid === false && <Badge variant="destructive">DMARC Fail</Badge>}
                  </div>
                </div>

                {dc.bimiRecord && (
                  <div className="text-xs font-mono text-muted-foreground break-all">
                    {dc.bimiRecord}
                  </div>
                )}

                <div className="grid gap-2 text-sm">
                  {dc.dmarcPolicy && (
                    <div className="flex gap-4">
                      <span className="w-40 shrink-0 text-muted-foreground">DMARC Policy</span>
                      <span className={
                        /^(quarantine|reject)$/i.test(dc.dmarcPolicy)
                          ? "text-emerald-600 dark:text-emerald-400 font-medium"
                          : "text-destructive font-medium"
                      }>
                        {dc.dmarcPolicy}
                      </span>
                    </div>
                  )}
                  {dc.logoUrl && <Row label="Logo URL" value={dc.logoUrl} mono />}
                  {dc.authorityUrl && <Row label="Authority URL" value={dc.authorityUrl} mono />}
                </div>

                {/* Logo comparison */}
                {dc.webSvgFound && cert.logotypeSvg && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Logo Comparison:</span>
                      {dc.svgMatch === true && (
                        <Badge className="bg-emerald-600 hover:bg-emerald-700">Match</Badge>
                      )}
                      {dc.svgMatch === false && (
                        <>
                          <Badge variant="destructive">Mismatch</Badge>
                          {dc.webSvgSource && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-xs"
                              onClick={() => setShowDiff(showDiff === dc.domain ? null : dc.domain)}
                            >
                              {showDiff === dc.domain ? "Hide Diff" : "View Diff"}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <div className="text-center">
                        <div
                          className="h-20 w-20 rounded-lg border bg-white p-1.5 mx-auto overflow-hidden [&>svg]:w-full [&>svg]:h-full"
                          dangerouslySetInnerHTML={{ __html: sanitizeSvg(cert.logotypeSvg) }}
                        />
                        <span className="text-xs text-muted-foreground mt-1 block">
                          Cert ({bimiCheck.certSvgSizeBytes ? `${(bimiCheck.certSvgSizeBytes / 1024).toFixed(1)}KB` : "?"})
                        </span>
                      </div>
                      <div className="text-center">
                        <div className="h-20 w-20 rounded-lg border bg-white p-1.5 mx-auto overflow-hidden">
                          {dc.logoUrl && (
                            <img
                              src={`/api/proxy/svg?url=${encodeURIComponent(dc.logoUrl)}`}
                              alt="Web BIMI logo"
                              className="h-full w-full object-contain"
                            />
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground mt-1 block">
                          Web ({dc.webSvgSizeBytes ? `${(dc.webSvgSizeBytes / 1024).toFixed(1)}KB` : "?"})
                        </span>
                      </div>
                    </div>

                    {/* SVG source diff */}
                    {showDiff === dc.domain && dc.webSvgSource && (
                      <SVGDiffViewer
                        certSvg={cert.logotypeSvg}
                        webSvg={dc.webSvgSource}
                      />
                    )}

                    {/* Web SVG validation */}
                    {dc.webSvgValidation && (
                      <div className="text-sm">
                        <span className="font-medium">Web SVG: </span>
                        {dc.webSvgValidation.valid ? (
                          <span className="text-emerald-600 dark:text-emerald-400">Valid SVG Tiny PS</span>
                        ) : (
                          <span className="text-destructive">
                            Invalid: {dc.webSvgValidation.errors.join("; ")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {dc.logoUrl && !dc.webSvgFound && (
                  <p className="text-sm text-muted-foreground">
                    Could not fetch web SVG from {dc.logoUrl}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Certificate Validity */}
      {bimiCheck?.certValidity && (
        <Card>
          <CardHeader>
            <CardTitle>Certificate Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatusCard
                label="Expiry"
                ok={!bimiCheck.certValidity.isExpired && !bimiCheck.certValidity.isNotYetValid}
                value={
                  bimiCheck.certValidity.isExpired
                    ? `Expired ${formatDistanceToNow(new Date(cert.notAfter))} ago`
                    : bimiCheck.certValidity.isNotYetValid
                      ? `Valid in ${formatDistanceToNow(new Date(cert.notBefore))}`
                      : `${bimiCheck.certValidity.daysRemaining} days remaining`
                }
                title={`${format(new Date(cert.notBefore), "PPP")} — ${format(new Date(cert.notAfter), "PPP")}`}
              />
              <StatusCard
                label="Mark Type"
                ok={!!cert.markType}
                value={cert.markType || "Not specified"}
              />
              <StatusCard
                label="Cert Type"
                ok={!!cert.certType}
                value={cert.certType || "Unknown"}
              />
              <StatusCard
                label="Embedded Logo"
                ok={!!cert.logotypeSvg}
                value={cert.logotypeSvg ? "Present" : "Missing"}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Subject Details */}
        <Card>
          <CardHeader>
            <CardTitle>Subject</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Common Name" value={cert.subjectCn} />
            <Row label="Organization" value={cert.subjectOrg} />
            <Row label="Country" value={cert.subjectCountry} />
            <Row label="State" value={cert.subjectState} />
            <Row label="Locality" value={cert.subjectLocality} />
            <Row label="Full DN" value={cert.subjectDn} />
          </CardContent>
        </Card>

        {/* Issuer + Validity */}
        <Card>
          <CardHeader>
            <CardTitle>Issuer & Validity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Issuer CN" value={cert.issuerCn} />
            <Row label="Issuer Org" value={cert.issuerOrg} />
            <Row label="Issuer DN" value={cert.issuerDn} />
            <Separator className="my-2" />
            <Row
              label="Valid From"
              value={format(new Date(cert.notBefore), "PPP")}
            />
            <Row
              label="Valid To"
              value={format(new Date(cert.notAfter), "PPP")}
            />
            <Row label="Serial Number" value={cert.serialNumber} mono />
          </CardContent>
        </Card>
      </div>

      {/* SANs */}
      {cert.sanList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subject Alternative Names ({cert.sanList.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {cert.sanList.map((san) => (
                <Link key={san} href={`/validate?domain=${encodeURIComponent(san)}`}>
                  <Badge variant="outline" className="hover:bg-secondary cursor-pointer">
                    {san}
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Certificate Chain */}
      {data.chain.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Certificate Chain</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Leaf cert */}
              <div className="rounded-lg border-2 border-primary/50 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">Leaf Certificate</div>
                  <Badge variant="outline" className="text-xs">Position 0</Badge>
                </div>
                <div className="text-sm text-muted-foreground mt-1">{cert.subjectDn}</div>
                <CopyableFingerprint
                  value={cert.fingerprintSha256}
                  copied={copied}
                  onCopy={copyToClipboard}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  {format(new Date(cert.notBefore), "MMM d, yyyy")} - {format(new Date(cert.notAfter), "MMM d, yyyy")}
                </div>
              </div>
              {/* Chain certs */}
              {data.chain.map((c) => {
                const label = chainLabel(c);
                const isRoot = c.subjectDn === c.issuerDn;
                return (
                  <div
                    key={c.id}
                    className={`ml-6 rounded-lg border p-3 ${isRoot ? "border-amber-500/50" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{label}</div>
                      <Badge variant="outline" className="text-xs">Position {c.chainPosition}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">{c.subjectDn}</div>
                    <CopyableFingerprint
                      value={c.fingerprintSha256}
                      copied={copied}
                      onCopy={copyToClipboard}
                    />
                    {c.notBefore && c.notAfter && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {format(new Date(c.notBefore), "MMM d, yyyy")} - {format(new Date(c.notAfter), "MMM d, yyyy")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Extensions */}
      {cert.extensionsJson && Object.keys(cert.extensionsJson).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Extensions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(cert.extensionsJson).map(([oid, value]) => {
                  const hexStr = typeof value === "string" ? value : JSON.stringify(value);
                  const ext = decodeExtension(oid, hexStr);
                  return (
                    <TableRow key={oid}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{oid}</TableCell>
                      <TableCell className="whitespace-nowrap">{ext.name}</TableCell>
                      <TableCell className="max-w-md text-xs">
                        {ext.decoded ? (
                          <span className="whitespace-pre-wrap break-all">{ext.decoded}</span>
                        ) : (
                          <span className="font-mono text-muted-foreground break-all">
                            {hexStr.substring(0, 80)}{hexStr.length > 80 ? "..." : ""}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Identifiers & CT Log */}
      <Card>
        <CardHeader>
          <CardTitle>Identifiers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-40 shrink-0 text-muted-foreground">Fingerprint (SHA-256)</span>
            <code className="break-all text-xs font-mono">{cert.fingerprintSha256}</code>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => copyToClipboard(cert.fingerprintSha256, "fingerprint")}
            >
              {copied === "fingerprint" ? "Copied" : "Copy"}
            </Button>
          </div>
          <Row label="Serial Number" value={cert.serialNumber} mono />
          <Separator className="my-2" />
          <Row
            label="CT Log Timestamp"
            value={
              cert.ctLogTimestamp
                ? format(new Date(cert.ctLogTimestamp), "PPP pp")
                : null
            }
          />
          <Row label="CT Log Index" value={cert.ctLogIndex} />
          <Row label="CT Log" value="Gorgon (DigiCert)" />
          {cert.crtshId && (
            <div className="flex gap-4">
              <span className="w-40 shrink-0 text-muted-foreground">crt.sh</span>
              <a
                href={`https://crt.sh/?id=${cert.crtshId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:underline"
              >
                crt.sh/?id={cert.crtshId}
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Raw PEM */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Raw PEM</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPem(!showPem)}
            >
              {showPem ? "Hide" : "Show"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(cert.rawPem, "pem")}
            >
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

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <span className="w-40 shrink-0 text-muted-foreground">{label}</span>
      <span className={`break-all ${mono ? "font-mono text-xs" : ""}`}>
        {value || "-"}
      </span>
    </div>
  );
}

function StatusCard({ label, ok, value, title }: { label: string; ok: boolean; value: string; title?: string }) {
  return (
    <div
      className={`rounded-lg border p-3 ${ok ? "border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20" : "border-destructive/30 bg-destructive/5"}`}
      title={title}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium ${ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
        {value}
      </div>
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

/**
 * Unified line-by-line diff of two SVG sources.
 * Lines only in A (cert) get a red background, lines only in B (web) get green,
 * unchanged lines are dimmed for context.
 */
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

interface DiffLine {
  type: "unchanged" | "added" | "removed";
  text: string;
  certLineNo: number | null;
  webLineNo: number | null;
}

/** LCS-based unified diff */
function computeDiff(a: string[], b: string[]): DiffLine[] {
  // Build LCS table
  const m = a.length;
  const n = b.length;

  // For very large SVGs, limit to avoid freezing the browser
  if (m > 2000 || n > 2000) {
    return [
      ...a.map((text, i): DiffLine => ({ type: "removed", text, certLineNo: i + 1, webLineNo: null })),
      ...b.map((text, i): DiffLine => ({ type: "added", text, certLineNo: null, webLineNo: i + 1 })),
    ];
  }

  // Space-optimized LCS using two rows
  const prev = new Uint16Array(n + 1);
  const curr = new Uint16Array(n + 1);
  const directions: Uint8Array[] = [];

  for (let i = 0; i <= m; i++) {
    directions.push(new Uint8Array(n + 1));
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        directions[i][j] = 1; // diagonal
      } else if (prev[j] >= curr[j - 1]) {
        curr[j] = prev[j];
        directions[i][j] = 2; // up
      } else {
        curr[j] = curr[j - 1];
        directions[i][j] = 3; // left
      }
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && directions[i][j] === 1) {
      result.push({ type: "unchanged", text: a[i - 1], certLineNo: i, webLineNo: j });
      i--;
      j--;
    } else if (i > 0 && (j === 0 || directions[i][j] === 2)) {
      result.push({ type: "removed", text: a[i - 1], certLineNo: i, webLineNo: null });
      i--;
    } else {
      result.push({ type: "added", text: b[j - 1], certLineNo: null, webLineNo: j });
      j--;
    }
  }

  return result.reverse();
}
