"use client";

import { useEffect, useState } from "react";
import { ValidationChecklist } from "@/components/bimi/validation-checklist";
import { ValidationGrade } from "@/components/bimi/validation-grade";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BimiCheckItem, BimiGrade } from "@/lib/bimi/types";

interface ValidationResult {
  domain: string;
  bimi: {
    found: boolean;
    record: { raw: string; logoUrl: string | null; authorityUrl: string | null } | null;
    declined: boolean;
    orgDomainFallback: boolean;
    orgDomain: string | null;
  };
  dmarc: {
    found: boolean;
    record: { raw: string; policy: string; pct: number } | null;
    validForBIMI: boolean;
    reason: string | null;
  };
  svg: { found: boolean; validation: { valid: boolean; errors: string[]; warnings: string[] } | null };
  certificate: { found: boolean; certType: string | null; issuer: string | null };
  grade: BimiGrade;
  gradeSummary: string;
  checks: BimiCheckItem[];
  overallValid: boolean;
  errors: string[];
}

export function DomainAnalysis({ domain }: { domain: string }) {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Validation failed (${res.status})`);
        return res.json();
      })
      .then(setValidation)
      .catch((err) => setError(err instanceof Error ? err.message : "Analysis failed"))
      .finally(() => setLoading(false));
  }, [domain]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Analyzing {domain}...</div>;
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-destructive">{error}</p>
        <p className="text-sm text-muted-foreground">Could not analyze {domain}. Try again later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{domain}</h1>
          <p className="text-muted-foreground">BIMI domain analysis</p>
        </div>
        {validation && (
          <div className="flex items-center gap-3">
            <ValidationGrade grade={validation.grade} summary={validation.gradeSummary} />
            <Badge variant={validation.overallValid ? "default" : "destructive"} className="text-base px-4 py-1">
              {validation.overallValid ? "BIMI Valid" : "BIMI Invalid"}
            </Badge>
          </div>
        )}
      </div>

      {validation && (
        <>
          {/* BIMI Record */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                BIMI Record
                <Badge variant={validation.bimi.found ? "default" : "destructive"}>
                  {validation.bimi.declined ? "Declined" : validation.bimi.found ? "Found" : "Missing"}
                </Badge>
              </CardTitle>
            </CardHeader>
            {validation.bimi.record && (
              <CardContent className="text-sm space-y-1">
                <div>
                  <span className="text-muted-foreground">Raw:</span> {validation.bimi.record.raw}
                </div>
                {validation.bimi.record.logoUrl && (
                  <div>
                    <span className="text-muted-foreground">Logo URL:</span> {validation.bimi.record.logoUrl}
                  </div>
                )}
                {validation.bimi.record.authorityUrl && (
                  <div>
                    <span className="text-muted-foreground">Authority URL:</span> {validation.bimi.record.authorityUrl}
                  </div>
                )}
                {validation.bimi.orgDomainFallback && (
                  <div className="text-xs text-muted-foreground">
                    Found via org domain fallback ({validation.bimi.orgDomain})
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* DMARC */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                DMARC
                <Badge variant={validation.dmarc.validForBIMI ? "default" : "destructive"}>
                  {validation.dmarc.validForBIMI ? "BIMI Ready" : "Not BIMI Ready"}
                </Badge>
              </CardTitle>
            </CardHeader>
            {validation.dmarc.record && (
              <CardContent className="text-sm space-y-1">
                <div>
                  <span className="text-muted-foreground">Policy:</span> {validation.dmarc.record.policy}
                </div>
                <div>
                  <span className="text-muted-foreground">PCT:</span> {validation.dmarc.record.pct}%
                </div>
                <div>
                  <span className="text-muted-foreground">Raw:</span> {validation.dmarc.record.raw}
                </div>
                {validation.dmarc.reason && <div className="text-destructive text-xs">{validation.dmarc.reason}</div>}
              </CardContent>
            )}
          </Card>

          {/* SVG Logo */}
          {validation.bimi.record?.logoUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  SVG Logo
                  {validation.svg.validation && (
                    <Badge variant={validation.svg.validation.valid ? "default" : "destructive"}>
                      {validation.svg.validation.valid ? "Valid" : "Invalid"}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/proxy/svg?url=${encodeURIComponent(validation.bimi.record.logoUrl!)}`}
                    alt={`${domain} BIMI logo`}
                    className="h-24 w-24 rounded-lg border bg-white p-1"
                  />
                  {validation.svg.validation && (
                    <div className="text-sm space-y-1">
                      {validation.svg.validation.errors.map((e, i) => (
                        <div key={i} className="text-destructive">
                          &#x2022; {e}
                        </div>
                      ))}
                      {validation.svg.validation.warnings.map((w, i) => (
                        <div key={i} className="text-yellow-600">
                          &#x26A0; {w}
                        </div>
                      ))}
                      {validation.svg.validation.valid && validation.svg.validation.warnings.length === 0 && (
                        <div className="text-green-600">SVG Tiny PS validation passed</div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Structured checklist */}
          {validation.checks.length > 0 && <ValidationChecklist checks={validation.checks} />}

          {/* Errors */}
          {validation.errors.length > 0 && (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive">Issues</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {validation.errors.map((err, i) => (
                    <li key={i} className="text-destructive">
                      &#x2022; {err}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
