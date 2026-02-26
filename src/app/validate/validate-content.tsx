"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HostnameAutocomplete } from "@/components/hostname-autocomplete";

interface ChainValidation {
  chainValid: boolean;
  chainErrors: string[];
  chainLength: number;
}

interface ValidationResult {
  domain: string;
  timestamp: string;
  bimi: { found: boolean; record: { raw: string; version: string; logoUrl: string | null; authorityUrl: string | null } | null };
  dmarc: { found: boolean; record: { raw: string; policy: string; pct: number } | null; validForBIMI: boolean };
  svg: { found: boolean; url: string | null; validation: { valid: boolean; errors: string[]; warnings: string[] } | null; sizeBytes: number | null };
  certificate: {
    found: boolean;
    certType: string | null;
    issuer: string | null;
    validFrom: string | null;
    validTo: string | null;
    isExpired: boolean | null;
    chain: ChainValidation | null;
  };
  overallValid: boolean;
  errors: string[];
}

export function ValidateContent() {
  const searchParams = useSearchParams();
  const urlDomain = searchParams.get("domain") || "";
  const [domain, setDomain] = useState(urlDomain);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-validate if domain comes from URL
  useEffect(() => {
    if (urlDomain) {
      setLoading(true);
      fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: urlDomain.trim() }),
      })
        .then((res) => res.json().then((data) => {
          if (!res.ok) throw new Error(data.error || "Validation failed");
          return data;
        }))
        .then(setResult)
        .catch((err) => setError(err instanceof Error ? err.message : "Validation failed"))
        .finally(() => setLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleValidate(overrideDomain?: string) {
    const target = (overrideDomain || domain).trim();
    if (!target) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: target }),
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">BIMI Validator</h1>
        <p className="text-muted-foreground">
          Check if a domain is ready for BIMI (Brand Indicators for Message Identification). Tests DNS records, DMARC policy, SVG logo compliance, and certificate status.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <HostnameAutocomplete
              value={domain}
              onChange={setDomain}
              onSelect={(val) => {
                setDomain(val);
                handleValidate(val);
              }}
              placeholder="example.com"
              className="max-w-md flex-1"
            />
            <Button onClick={() => handleValidate()} disabled={loading}>
              {loading ? "Validating..." : "Validate"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive" role="alert">
          <CardContent className="pt-6 text-destructive">{error}</CardContent>
        </Card>
      )}

      {result && (
        <div className="space-y-4">
          {/* Overall result with readiness score */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-3">
              <Badge
                variant={result.overallValid ? "default" : "destructive"}
                className="text-base px-4 py-1"
              >
                {result.overallValid ? "PASS" : "FAIL"}
              </Badge>
              <CardTitle>{result.domain}</CardTitle>
              <ReadinessScore result={result} />
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

          {/* Sequential validation steps with dependency chain */}
          <div className="relative">
            {/* Vertical connector line between steps */}
            <div className="absolute left-[1.65rem] top-10 bottom-10 w-0.5 bg-border hidden sm:block" />

            <div className="space-y-4">
              {/* Step 1: BIMI DNS */}
              <CheckCard
                step={1}
                title="BIMI DNS Record"
                subtitle="The foundation: your BIMI TXT record must exist"
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
                guidance={
                  <div>
                    <p>Add a TXT record at <code className="text-xs bg-background px-1 py-0.5 rounded">default._bimi.{result.domain}</code> with the following format:</p>
                    <p><code className="text-xs bg-background px-1 py-0.5 rounded">v=BIMI1; l=https://example.com/logo.svg; a=https://example.com/cert.pem;</code></p>
                    <p>The <code className="text-xs bg-background px-1 py-0.5 rounded">l=</code> tag points to your SVG Tiny PS logo file hosted over HTTPS. The <code className="text-xs bg-background px-1 py-0.5 rounded">a=</code> tag points to your VMC or CMC certificate in PEM format.</p>
                  </div>
                }
              />

              {/* Step 2: DMARC */}
              <CheckCard
                step={2}
                title="DMARC Policy"
                subtitle="Email authentication must be enforced before BIMI works"
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
                guidance={
                  <div>
                    <p>BIMI requires a DMARC policy of <code className="text-xs bg-background px-1 py-0.5 rounded">p=quarantine</code> or <code className="text-xs bg-background px-1 py-0.5 rounded">p=reject</code> with <code className="text-xs bg-background px-1 py-0.5 rounded">pct=100</code> (the default if omitted).</p>
                    <p>Start with <code className="text-xs bg-background px-1 py-0.5 rounded">p=quarantine</code> if you haven&apos;t enforced DMARC yet. Make sure SPF and DKIM are properly configured first, then monitor reports before moving to <code className="text-xs bg-background px-1 py-0.5 rounded">p=reject</code>.</p>
                  </div>
                }
              />

              {/* Step 3: Certificate */}
              <CheckCard
                step={3}
                title="Authority Certificate"
                subtitle="A valid VMC or CMC proves your brand identity"
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
                    {result.certificate.chain && (
                      <>
                        <Row
                          label="Chain"
                          value={
                            result.certificate.chain.chainValid
                              ? `Valid (${result.certificate.chain.chainLength} cert${result.certificate.chain.chainLength !== 1 ? "s" : ""})`
                              : `Issues found (${result.certificate.chain.chainLength} cert${result.certificate.chain.chainLength !== 1 ? "s" : ""})`
                          }
                        />
                        {result.certificate.chain.chainErrors.map((e, i) => (
                          <div key={i} className="text-destructive ml-40 text-xs">
                            &#x2022; {e}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                }
                guidance={
                  <div>
                    <p>BIMI supports two certificate types: <strong>VMC</strong> (Verified Mark Certificate) requires a registered trademark and costs around $1,500/yr from CAs like DigiCert or Entrust. <strong>CMC</strong> (Common Mark Certificate) does not require a trademark, making it accessible to any organization.</p>
                    <p>Host the certificate in PEM format at an HTTPS URL and reference it in your BIMI DNS record using the <code className="text-xs bg-background px-1 py-0.5 rounded">a=</code> tag.</p>
                  </div>
                }
              />

              {/* Step 4: SVG Logo */}
              <CheckCard
                step={4}
                title="SVG Logo"
                subtitle="Your logo must meet SVG Tiny PS requirements"
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
                guidance={
                  <div>
                    <p>Your logo must be in SVG Tiny PS (Portable/Secure) format with a square aspect ratio and hosted over HTTPS. Most existing SVG logos will need conversion since SVG Tiny PS is a restricted subset of SVG that disallows scripts, external references, and many advanced features.</p>
                    <p>Tools like the BIMI Group&apos;s SVG converter or Adobe Illustrator&apos;s &quot;SVG Tiny 1.2&quot; export can help. The final file should use <code className="text-xs bg-background px-1 py-0.5 rounded">baseProfile=&quot;tiny-ps&quot;</code> and <code className="text-xs bg-background px-1 py-0.5 rounded">version=&quot;1.2&quot;</code> in the root element.</p>
                  </div>
                }
              />

              {/* Client Compatibility */}
              {result.svg.validation && <ClientCompatibility result={result} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckCard({
  step,
  title,
  subtitle,
  pass,
  details,
  guidance,
}: {
  step: number;
  title: string;
  subtitle: string;
  pass: boolean;
  details: React.ReactNode;
  guidance?: React.ReactNode;
}) {
  // Guidance is expanded by default on FAIL, collapsed for PASS
  const [showGuide, setShowGuide] = useState(!pass);
  return (
    <Card className="relative sm:pl-6">
      {/* Step number indicator */}
      <div className="absolute left-3 top-4 sm:left-[-0.5rem] sm:top-4 z-10">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ring-4 ring-background ${
            pass
              ? "bg-emerald-600 text-white dark:bg-emerald-500"
              : "bg-destructive text-destructive-foreground"
          }`}
        >
          {pass ? "\u2713" : step}
        </div>
      </div>
      <CardHeader className="flex flex-row items-center gap-3 pb-2 pl-12 sm:pl-8">
        <Badge variant={pass ? "default" : "destructive"}>
          {pass ? "PASS" : "FAIL"}
        </Badge>
        <div>
          <CardTitle className="text-lg">{title}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pl-12 sm:pl-8">
        {details}
        {guidance && !pass && (
          <div>
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="text-sm text-primary hover:underline font-medium"
            >
              {showGuide ? "Hide guidance" : "How to fix this"}
            </button>
            {showGuide && (
              <div className="mt-2 rounded-md bg-muted p-3 text-sm space-y-2">
                {guidance}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4">
      <span className="sm:w-40 sm:shrink-0 text-muted-foreground text-xs sm:text-sm">{label}</span>
      <span className="break-all">{value || "-"}</span>
    </div>
  );
}

function ClientCompatibility({ result }: { result: ValidationResult }) {
  const [open, setOpen] = useState(false);

  const warnings = result.svg.validation?.warnings ?? [];
  const errors = result.svg.validation?.errors ?? [];
  const hasVMC = result.certificate.found && result.certificate.certType === "VMC";
  const hasCMC = result.certificate.found && result.certificate.certType === "CMC";
  const hasCert = hasVMC || hasCMC;

  const missingDimensions = warnings.some((w) => w.includes("Missing explicit width/height"));
  const smallDimensions = warnings.some((w) => w.includes("below Gmail minimum"));
  const highPathCount = warnings.some((w) => w.includes("High path count"));
  const hasAnimation = errors.some((e) => e.includes("animation"));

  type Support = "full" | "partial" | "none" | "unknown";

  const clients: {
    name: string;
    support: Support;
    certReq: string;
    notes: string[];
  }[] = [
    {
      name: "Gmail",
      support: hasCert && !missingDimensions && !smallDimensions ? "full" : hasCert ? "partial" : "none",
      certReq: "VMC or CMC",
      notes: [
        ...(missingDimensions ? ["Requires explicit width/height attributes"] : []),
        ...(smallDimensions ? ["Minimum 96x96 dimensions required"] : []),
        ...(!hasCert ? ["Requires a valid VMC or CMC certificate"] : []),
      ],
    },
    {
      name: "Apple Mail",
      support: hasCert && !highPathCount ? "full" : hasCert ? "partial" : "none",
      certReq: "VMC or CMC",
      notes: [
        ...(highPathCount ? ["High path count may render poorly at small display sizes (14pt)"] : []),
        ...(hasAnimation ? ["Animations not supported"] : []),
        ...(!hasCert ? ["Requires a valid VMC or CMC certificate"] : []),
        "Renders at 14pt (list) and 30pt (message header)",
      ],
    },
    {
      name: "Yahoo Mail",
      support: result.bimi.found && result.svg.found ? "full" : "partial",
      certReq: "Optional (shows without cert)",
      notes: [
        "Less strict SVG validation than Gmail",
        "Will show logo even without a VMC/CMC (self-asserted BIMI)",
      ],
    },
    {
      name: "Outlook / Hotmail",
      support: "none",
      certReq: "N/A",
      notes: ["Microsoft does not currently support BIMI"],
    },
  ];

  const supportBadge = (s: Support) => {
    switch (s) {
      case "full":
        return <Badge variant="default" className="text-xs">Supported</Badge>;
      case "partial":
        return <Badge className="text-xs bg-amber-600 hover:bg-amber-700 text-white">Partial</Badge>;
      case "none":
        return <Badge variant="destructive" className="text-xs">No</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Unknown</Badge>;
    }
  };

  return (
    <Card className="relative sm:pl-6">
      <div className="absolute left-3 top-4 sm:left-[-0.5rem] sm:top-4 z-10">
        <div className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ring-4 ring-background bg-muted text-muted-foreground">
          5
        </div>
      </div>
      <CardHeader className="flex flex-row items-center gap-3 pb-2 pl-12 sm:pl-8">
        <Badge variant="secondary">INFO</Badge>
        <div>
          <CardTitle className="text-lg">Client Compatibility</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">How your BIMI setup works across email clients</p>
        </div>
      </CardHeader>
      <CardContent className="pl-12 sm:pl-8">
        <button
          onClick={() => setOpen(!open)}
          className="text-sm text-primary hover:underline font-medium"
        >
          {open ? "Hide compatibility matrix" : "Show compatibility matrix"}
        </button>
        {open && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4 font-medium">Client</th>
                  <th className="py-2 pr-4 font-medium">BIMI Support</th>
                  <th className="py-2 pr-4 font-medium">Cert Required</th>
                  <th className="py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.name} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{c.name}</td>
                    <td className="py-2 pr-4">{supportBadge(c.support)}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{c.certReq}</td>
                    <td className="py-2">
                      {c.notes.length > 0 && (
                        <ul className="space-y-0.5 text-muted-foreground">
                          {c.notes.map((n, i) => (
                            <li key={i} className="text-xs">&#x2022; {n}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReadinessScore({ result }: { result: ValidationResult }) {
  let score = 0;
  const checks = [
    result.bimi.found,
    result.dmarc.validForBIMI,
    result.svg.found,
    result.svg.validation?.valid ?? false,
    result.certificate.found && !result.certificate.isExpired,
  ];
  score = checks.filter(Boolean).length;
  const pct = Math.round((score / checks.length) * 100);
  const color =
    pct >= 80
      ? "text-emerald-600 dark:text-emerald-400"
      : pct >= 50
        ? "text-amber-600 dark:text-amber-400"
        : "text-destructive";

  return (
    <div className="ml-auto flex items-center gap-2">
      <span className={`text-2xl font-bold tabular-nums ${color}`}>{pct}%</span>
      <span className="text-xs text-muted-foreground">BIMI Ready<br />{score}/{checks.length} checks</span>
    </div>
  );
}
