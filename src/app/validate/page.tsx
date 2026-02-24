"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface ValidationResult {
  domain: string;
  timestamp: string;
  bimi: { found: boolean; record: { raw: string; version: string; logoUrl: string | null; authorityUrl: string | null } | null };
  dmarc: { found: boolean; record: { raw: string; policy: string; pct: number } | null; validForBIMI: boolean };
  svg: { found: boolean; url: string | null; validation: { valid: boolean; errors: string[]; warnings: string[] } | null; sizeBytes: number | null };
  certificate: { found: boolean; certType: string | null; issuer: string | null; validFrom: string | null; validTo: string | null; isExpired: boolean | null };
  overallValid: boolean;
  errors: string[];
}

export default function ValidatePage() {
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleValidate() {
    if (!domain.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Validation failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">BIMI Validator</h1>
        <p className="text-muted-foreground">
          Enter a domain to run a full BIMI validation check (DMARC, DNS, SVG, certificate).
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Input
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleValidate()}
              className="max-w-md"
            />
            <Button onClick={handleValidate} disabled={loading}>
              {loading ? "Validating..." : "Validate"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-destructive">{error}</CardContent>
        </Card>
      )}

      {result && (
        <div className="space-y-4">
          {/* Overall result */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-3">
              <Badge
                variant={result.overallValid ? "default" : "destructive"}
                className="text-base px-4 py-1"
              >
                {result.overallValid ? "PASS" : "FAIL"}
              </Badge>
              <CardTitle>{result.domain}</CardTitle>
            </CardHeader>
            {result.errors.length > 0 && (
              <CardContent>
                <ul className="space-y-1 text-sm text-destructive">
                  {result.errors.map((err, i) => (
                    <li key={i}>&#x2022; {err}</li>
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>

          {/* BIMI DNS */}
          <CheckCard
            title="BIMI DNS Record"
            pass={result.bimi.found}
            details={
              result.bimi.record ? (
                <div className="space-y-1 text-sm">
                  <Row label="Raw" value={result.bimi.record.raw} />
                  <Row label="Version" value={result.bimi.record.version} />
                  <Row label="Logo URL" value={result.bimi.record.logoUrl} />
                  <Row label="Authority URL" value={result.bimi.record.authorityUrl} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No BIMI record found at default._bimi.{result.domain}
                </p>
              )
            }
          />

          {/* DMARC */}
          <CheckCard
            title="DMARC Policy"
            pass={result.dmarc.validForBIMI}
            details={
              result.dmarc.record ? (
                <div className="space-y-1 text-sm">
                  <Row label="Raw" value={result.dmarc.record.raw} />
                  <Row label="Policy" value={result.dmarc.record.policy} />
                  <Row label="PCT" value={String(result.dmarc.record.pct)} />
                  <Row
                    label="BIMI Ready"
                    value={result.dmarc.validForBIMI ? "Yes" : "No (needs p=quarantine/reject, pct=100)"}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No DMARC record found</p>
              )
            }
          />

          {/* SVG */}
          <CheckCard
            title="SVG Logo"
            pass={result.svg.found && (result.svg.validation?.valid ?? false)}
            details={
              <div className="space-y-1 text-sm">
                <Row label="Found" value={result.svg.found ? "Yes" : "No"} />
                {result.svg.url && <Row label="URL" value={result.svg.url} />}
                {result.svg.sizeBytes !== null && (
                  <Row label="Size" value={`${result.svg.sizeBytes} bytes`} />
                )}
                {result.svg.validation && (
                  <>
                    <Row
                      label="SVG Tiny PS"
                      value={result.svg.validation.valid ? "Valid" : "Invalid"}
                    />
                    {result.svg.validation.errors.map((e, i) => (
                      <div key={i} className="text-destructive ml-40">
                        &#x2022; {e}
                      </div>
                    ))}
                    {result.svg.validation.warnings.map((w, i) => (
                      <div key={i} className="text-yellow-600 ml-40">
                        &#x26A0; {w}
                      </div>
                    ))}
                  </>
                )}
              </div>
            }
          />

          {/* Certificate */}
          <CheckCard
            title="Authority Certificate"
            pass={result.certificate.found && !result.certificate.isExpired}
            details={
              <div className="space-y-1 text-sm">
                <Row label="Found" value={result.certificate.found ? "Yes" : "No"} />
                {result.certificate.certType && (
                  <Row label="Type" value={result.certificate.certType} />
                )}
                {result.certificate.issuer && (
                  <Row label="Issuer" value={result.certificate.issuer} />
                )}
                {result.certificate.validFrom && (
                  <Row label="Valid From" value={result.certificate.validFrom} />
                )}
                {result.certificate.validTo && (
                  <Row label="Valid To" value={result.certificate.validTo} />
                )}
                {result.certificate.isExpired !== null && (
                  <Row
                    label="Status"
                    value={result.certificate.isExpired ? "Expired" : "Active"}
                  />
                )}
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}

function CheckCard({
  title,
  pass,
  details,
}: {
  title: string;
  pass: boolean;
  details: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 pb-2">
        <Badge variant={pass ? "default" : "destructive"}>
          {pass ? "PASS" : "FAIL"}
        </Badge>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>{details}</CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-4">
      <span className="w-40 shrink-0 text-muted-foreground">{label}</span>
      <span className="break-all">{value || "-"}</span>
    </div>
  );
}
