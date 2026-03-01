"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HostnameAutocomplete } from "@/components/hostname-autocomplete";
import { ValidationGrade } from "@/components/bimi/validation-grade";
import { ValidationChecklist } from "@/components/bimi/validation-checklist";
import { NextSteps } from "@/components/bimi/next-steps";
import { TechnicalDetails } from "@/components/bimi/technical-details";
import type { BimiCheckItem, BimiGrade } from "@/lib/bimi/types";

interface ChainValidation {
  chainValid: boolean;
  chainErrors: string[];
  chainLength: number;
}

interface ValidationResult {
  domain: string;
  timestamp: string;
  bimi: {
    found: boolean;
    record: {
      raw: string;
      version: string;
      logoUrl: string | null;
      authorityUrl: string | null;
      lps: string | null;
      avp: "brand" | "personal" | null;
      declined: boolean;
      selector: string;
      orgDomainFallback: boolean;
      orgDomain: string | null;
    } | null;
    lps: string | null;
    avp: "brand" | "personal" | null;
    declined: boolean;
    selector: string;
    orgDomainFallback: boolean;
    orgDomain: string | null;
  };
  dmarc: {
    found: boolean;
    record: { raw: string; policy: string; pct: number; sp: string | null } | null;
    validForBIMI: boolean;
    reason: string | null;
    isSubdomain: boolean;
  };
  svg: {
    found: boolean;
    url: string | null;
    validation: { valid: boolean; errors: string[]; warnings: string[] } | null;
    sizeBytes: number | null;
    indicatorHash: string | null;
  };
  certificate: {
    found: boolean;
    authorityUrl: string | null;
    certType: string | null;
    issuer: string | null;
    validFrom: string | null;
    validTo: string | null;
    isExpired: boolean | null;
    chain: ChainValidation | null;
    authorizedCa: boolean | null;
    certSvgHash: string | null;
    svgMatch: boolean | null;
  };
  grade: BimiGrade;
  gradeSummary: string;
  checks: BimiCheckItem[];
  authResult: string;
  responseHeaders: Record<string, string>;
  overallValid: boolean;
  errors: string[];
}

export function ValidateContent() {
  const searchParams = useSearchParams();
  const urlDomain = searchParams.get("domain") || "";
  const [domain, setDomain] = useState(urlDomain);
  const [selector, setSelector] = useState("default");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-validate if domain comes from URL
  useEffect(() => {
    if (urlDomain) {
      doValidate(urlDomain.trim());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doValidate(target: string, sel?: string) {
    if (!target) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const body: Record<string, string> = { domain: target };
      const s = sel || selector;
      if (s && s !== "default") body.selector = s;

      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Validation failed");
      setResult(data);
      window.history.replaceState(null, "", `/validate?domain=${encodeURIComponent(target)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setLoading(false);
    }
  }

  function handleValidate(overrideDomain?: string) {
    doValidate((overrideDomain || domain).trim());
  }

  // Extract RNG-specific checks for the technical details panel
  const rngChecks = result?.checks.filter((c) => c.id.startsWith("rng-")) ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">BIMI Validator</h1>
        <p className="text-muted-foreground">
          Check if a domain is ready for BIMI (Brand Indicators for Message Identification). Tests DNS records, DMARC policy, SVG logo compliance, and certificate status.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <HostnameAutocomplete
              value={domain}
              onChange={setDomain}
              onSelect={(val) => {
                setDomain(val);
                handleValidate(val);
              }}
              placeholder="example.com"
              className="sm:max-w-md flex-1"
            />
            <Button onClick={() => handleValidate()} disabled={loading}>
              {loading ? "Validating..." : "Validate"}
            </Button>
          </div>
          <details open={showAdvanced} onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}>
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              Advanced options
            </summary>
            <div className="mt-2 flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Selector:</label>
              <input
                type="text"
                value={selector}
                onChange={(e) => setSelector(e.target.value)}
                placeholder="default"
                className="text-xs border rounded px-2 py-1 w-32 bg-background"
              />
            </div>
          </details>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive" role="alert">
          <CardContent className="pt-6 text-destructive">{error}</CardContent>
        </Card>
      )}

      {result && (
        <div className="space-y-4">
          {/* Tier 1: The Verdict */}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center gap-4">
              <ValidationGrade grade={result.grade} summary={result.gradeSummary} />
              <div className="ml-auto flex items-center gap-2">
                <Badge
                  variant={result.overallValid ? "default" : "destructive"}
                  className="text-base px-4 py-1"
                >
                  {result.overallValid ? "PASS" : "FAIL"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm font-medium">{result.domain}</p>
              {result.bimi.orgDomainFallback && (
                <p className="text-xs text-muted-foreground">
                  BIMI record found via org domain fallback ({result.bimi.orgDomain})
                </p>
              )}
              {result.bimi.declined && (
                <p className="text-sm text-destructive">
                  This domain has explicitly declined BIMI participation
                </p>
              )}
              {result.errors.length > 0 && (
                <ul className="space-y-1 text-sm text-destructive">
                  {result.errors.map((err, i) => (
                    <li key={i}>&#x2022; {err}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Next Steps: actionable guidance based on failures */}
          <NextSteps checks={result.checks} overallValid={result.overallValid} />

          {/* Tier 2: The Checklist (tabbed) */}
          <ValidationChecklist checks={result.checks} />

          {/* Tier 3: Technical Deep Dive */}
          <Card>
            <CardContent className="pt-6">
              <TechnicalDetails
                authResult={result.authResult}
                responseHeaders={result.responseHeaders}
                rngChecks={rngChecks}
                rawBimiRecord={result.bimi.record?.raw}
                rawDmarcRecord={result.dmarc.record?.raw}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
