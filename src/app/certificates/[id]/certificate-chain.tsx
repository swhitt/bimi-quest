"use client";

import { useState } from "react";
import { toast } from "sonner";
import { OrgChip } from "@/components/org-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { UtcTime } from "@/components/ui/utc-time";
import type { CertificateChainData } from "./certificate-types";
import { formatSerial } from "./certificate-types";

function chainLabel(chainCert: { chainPosition: number; subjectDn: string; issuerDn: string }): string {
  if (chainCert.subjectDn === chainCert.issuerDn) return "Root CA";
  if (chainCert.chainPosition === 1) return "Intermediate CA";
  return `Intermediate CA (${chainCert.chainPosition})`;
}

function CopyableFingerprint({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-1 mt-1">
      <span className="text-xs text-muted-foreground font-mono">
        SHA-256: {value.substring(0, 16)}...
        {value.substring(value.length - 8)}
      </span>
      <CopyButton value={value} label="Fingerprint" />
    </div>
  );
}

export function CertificateChain({ data }: { data: CertificateChainData }) {
  const cert = data.certificate;

  const [showPem, setShowPem] = useState(false);

  if (data.chain.length === 0 && !cert.rawPem) return null;

  return (
    <>
      {data.chain.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Certificate Chain</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
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
                    <CopyableFingerprint value={cert.fingerprintSha256} />
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
                        <CopyableFingerprint value={c.fingerprintSha256} />
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(cert.rawPem);
                toast.success("PEM copied");
              }}
            >
              Copy PEM
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const blob = new Blob([cert.rawPem], {
                  type: "application/x-pem-file",
                });
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
    </>
  );
}
