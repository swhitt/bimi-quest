"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LpsTrace } from "@/components/bimi/lps-trace";
import { NextSteps } from "@/components/bimi/next-steps";
import { ReceiverTrustResults } from "@/components/bimi/receiver-trust-results";
import { TechnicalDetails } from "@/components/bimi/technical-details";
import { ValidationChecklist } from "@/components/bimi/validation-checklist";
import { ValidationGrade } from "@/components/bimi/validation-grade";
import { HostnameAutocomplete } from "@/components/hostname-autocomplete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { BimiCheckItem, BimiGrade } from "@/lib/bimi/types";
import { errorMessage } from "@/lib/utils";

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
  caa: {
    status: "permissive" | "standard_only" | "vmc_authorized";
    entries: { critical: number; tag: string; value: string }[];
    issueVmcEntries: { critical: number; tag: string; value: string }[];
    authorizedCAs: string[];
  } | null;
  lpsTrace: {
    normalizedLocalPart: string;
    steps: {
      step: number;
      description: string;
      dnsName: string;
      result: "found" | "not_found" | "skipped";
    }[];
    matchedPrefix: string | null;
  } | null;
  receiverTrust: {
    entries: {
      receiverDomain: string;
      dnsName: string;
      found: boolean;
      txtValue: string | null;
    }[];
  } | null;
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
  const urlDomain = searchParams.get("q") || searchParams.get("domain") || "";
  const [domain, setDomain] = useState(urlDomain);
  const [selector, setSelector] = useState("default");
  const [receiverDomainsInput, setReceiverDomainsInput] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Prevents duplicate auto-validation calls in React strict mode (double-invocation).
  const didValidate = useRef(false);

  const doValidate = useCallback(
    async (target: string, sel?: string) => {
      if (!target) return;
      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const body: Record<string, unknown> = { domain: target };
        const s = sel || selector;
        if (s && s !== "default") body.selector = s;

        // Parse receiver domains from comma-separated input
        const receivers = receiverDomainsInput
          .split(",")
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean);
        if (receivers.length > 0) body.receiverDomains = receivers;

        const res = await fetch("/api/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Validation failed");
        setResult(data);
        window.history.replaceState(null, "", `/validate?q=${encodeURIComponent(target)}`);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [selector, receiverDomainsInput],
  );

  // Auto-validate when a domain is provided via URL query param (e.g. shared links).
  // The didValidate ref prevents a duplicate run in React strict mode.
  useEffect(() => {
    if (urlDomain && !didValidate.current) {
      didValidate.current = true;
      doValidate(urlDomain.trim());
    }
  }, [urlDomain, doValidate]);

  function handleValidate(overrideDomain?: string) {
    doValidate((overrideDomain || domain).trim());
  }

  // Extract RNG-specific checks for the technical details panel
  const rngChecks = result?.checks.filter((c) => c.id.startsWith("rng-")) ?? [];

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">BIMI Validator</h1>

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <HostnameAutocomplete
            value={domain}
            onChange={setDomain}
            onSelect={(val) => {
              setDomain(val);
              handleValidate(val);
            }}
            placeholder="example.com or user@example.com"
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
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Selector:</label>
              <input
                type="text"
                value={selector}
                onChange={(e) => setSelector(e.target.value)}
                placeholder="default"
                className="text-xs border rounded px-2 py-1 w-32 bg-background"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Receiver domains:</label>
              <input
                type="text"
                value={receiverDomainsInput}
                onChange={(e) => setReceiverDomainsInput(e.target.value)}
                placeholder="gmail.com, yahoo.com"
                className="text-xs border rounded px-2 py-1 w-64 bg-background"
              />
            </div>
          </div>
        </details>
      </div>

      {!result && !loading && !error && (
        <div className="mt-6 space-y-3">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">quick check</p>
          <div className="flex flex-wrap gap-2">
            {["paypal.com", "linkedin.com", "cnn.com", "amazon.com", "ups.com", "stripe.com"].map((d) => (
              <Button
                key={d}
                variant="outline"
                size="sm"
                className="font-mono text-xs"
                onClick={() => {
                  setDomain(d);
                  handleValidate(d);
                }}
              >
                {d}
              </Button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <Card className="border-destructive" role="alert">
          <CardContent className="pt-6 text-destructive">{error}</CardContent>
        </Card>
      )}

      {result && (
        <div className="space-y-3">
          {/* Tier 1: The Verdict */}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center gap-4">
              <ValidationGrade grade={result.grade} summary={result.gradeSummary} />
              <div className="ml-auto flex items-center gap-2">
                <Badge variant={result.overallValid ? "default" : "destructive"} className="text-base px-4 py-1">
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
                <p className="text-sm text-destructive">This domain has explicitly declined BIMI participation</p>
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

          {/* LPS Tiered Discovery trace (when email address was provided) */}
          {result.lpsTrace && <LpsTrace trace={result.lpsTrace} />}

          {/* Next Steps: actionable guidance based on failures */}
          <NextSteps checks={result.checks} overallValid={result.overallValid} />

          {/* Tier 2: The Checklist (tabbed) */}
          <ValidationChecklist checks={result.checks} />

          {/* Receiver Trust results */}
          {result.receiverTrust && <ReceiverTrustResults entries={result.receiverTrust.entries} />}

          {/* Tier 3: Technical Deep Dive */}
          <Card>
            <CardContent>
              <TechnicalDetails
                authResult={result.authResult}
                responseHeaders={result.responseHeaders}
                rngChecks={rngChecks}
                rawBimiRecord={result.bimi.record?.raw}
                rawDmarcRecord={result.dmarc.record?.raw}
                caa={result.caa}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
