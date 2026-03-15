"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ClipboardCopy, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { LintResult, LintSummary } from "@/lib/lint/types";
import { LintResults } from "./lint-results";

interface BimiRecordInfo {
  raw: string;
  domain: string;
  selector: string;
  logoUrl: string | null;
  authorityUrl: string | null;
  declined: boolean;
}

interface CertMeta {
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
  certType: "VMC" | "CMC" | null;
  sanList: string[];
}

interface LintResponse {
  results: LintResult[];
  summary: LintSummary;
  cert?: CertMeta;
}

interface LintError {
  error: string;
  bimiRecord?: BimiRecordInfo;
}

async function fetchLint(body: Record<string, string>): Promise<LintResponse> {
  const res = await fetch("/api/lint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("Rate limited — try again in a few seconds");
    }
    const err: LintError = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    const error = new Error(err.error ?? `HTTP ${res.status}`);
    if (err.bimiRecord) (error as Error & { bimiRecord?: BimiRecordInfo }).bimiRecord = err.bimiRecord;
    throw error;
  }
  return res.json();
}

function BimiRecordCard({ record }: { record: BimiRecordInfo }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          BIMI Record for {record.selector}._bimi.{record.domain}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs font-mono bg-muted rounded px-2 py-1.5 break-all">{record.raw}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {record.logoUrl && (
            <>
              <dt className="text-muted-foreground">Logo (l=)</dt>
              <dd className="truncate">
                <a
                  href={record.logoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {record.logoUrl}
                </a>
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">Authority (a=)</dt>
          <dd className="text-muted-foreground italic">{record.authorityUrl ?? "not set"}</dd>
          {record.declined && (
            <>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="text-destructive">Declined BIMI participation</dd>
            </>
          )}
        </dl>
        {!record.authorityUrl && !record.declined && (
          <p className="text-xs text-muted-foreground">
            This domain publishes a BIMI logo but no VMC/CMC certificate. Some mail clients display the logo without
            certificate verification, but Gmail and others require a valid certificate.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function extractCN(dn: string): string {
  const match = dn.match(/CN=([^,]+)/);
  return match ? match[1] : dn;
}

function CertSummaryCard({ cert }: { cert: CertMeta }) {
  const [serialCopied, setSerialCopied] = useState(false);
  const notBefore = new Date(cert.notBefore);
  const notAfter = new Date(cert.notAfter);
  const now = new Date();
  const isExpired = notAfter < now;
  const isNotYetValid = notBefore > now;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Certificate
          {cert.certType && (
            <Badge variant="outline" className="text-[10px] font-mono">
              {cert.certType}
            </Badge>
          )}
          {isExpired && (
            <Badge variant="destructive" className="text-[10px]">
              expired
            </Badge>
          )}
          {isNotYetValid && (
            <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">
              not yet valid
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Subject</dt>
          <dd className="truncate">{extractCN(cert.subject)}</dd>
          <dt className="text-muted-foreground">Issuer</dt>
          <dd className="truncate">{extractCN(cert.issuer)}</dd>
          <dt className="text-muted-foreground">Valid</dt>
          <dd>
            {notBefore.toISOString().slice(0, 10)} — {notAfter.toISOString().slice(0, 10)}
          </dd>
          {cert.sanList.length > 0 && (
            <>
              <dt className="text-muted-foreground">SANs</dt>
              <dd className="truncate font-mono">{cert.sanList.join(", ")}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Serial</dt>
          <dd className="truncate font-mono text-muted-foreground/60 flex items-center gap-1">
            <span className="truncate">{cert.serialNumber}</span>
            <button
              type="button"
              className="inline-flex shrink-0"
              onClick={() => {
                navigator.clipboard.writeText(cert.serialNumber);
                setSerialCopied(true);
                setTimeout(() => setSerialCopied(false), 2000);
              }}
              aria-label="Copy serial number"
            >
              {serialCopied ? (
                <Check className="size-3 text-emerald-500" />
              ) : (
                <ClipboardCopy className="size-3 text-muted-foreground hover:text-foreground" />
              )}
            </button>
          </dd>
        </dl>
        <a
          href={`/certificates?search=${encodeURIComponent(cert.serialNumber)}`}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
        >
          <ExternalLink className="size-3" />
          View in BIMI Quest
        </a>
      </CardContent>
    </Card>
  );
}

export function LintForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initDomain = searchParams.get("domain") ?? "";
  const initFp = searchParams.get("fingerprint") ?? "";
  const initSelector = searchParams.get("selector") ?? "default";
  const [domain, setDomain] = useState(initDomain);
  const [pem, setPem] = useState("");
  const [url, setUrl] = useState("");
  const [fingerprint, setFingerprint] = useState(initFp);
  const [selector, setSelector] = useState(initSelector);
  const [pemSizeError, setPemSizeError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bimiRecord, setBimiRecord] = useState<BimiRecordInfo | null>(null);
  const [response, setResponse] = useState<LintResponse | null>(null);
  const [activeTab, setActiveTab] = useState(initFp ? "fingerprint" : initDomain ? "domain" : "domain");
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const autoSubmittedRef = useRef<string | null>(null);
  const lastBodyRef = useRef<Record<string, string> | null>(null);

  const submit = useCallback(
    async (body: Record<string, string>) => {
      lastBodyRef.current = body;
      setLoading(true);
      setError(null);
      setBimiRecord(null);
      setResponse(null);
      try {
        const data = await fetchLint(body);
        setResponse(data);
        // Update URL for shareable links (skip PEM — too large)
        if ("domain" in body) {
          const selectorParam =
            body.selector && body.selector !== "default" ? `&selector=${encodeURIComponent(body.selector)}` : "";
          router.replace(`/tools/lint?domain=${encodeURIComponent(body.domain)}${selectorParam}`, { scroll: false });
        } else if ("fingerprint" in body) {
          router.replace(`/tools/lint?fingerprint=${encodeURIComponent(body.fingerprint)}`, { scroll: false });
        }
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
          const rec = (err as Error & { bimiRecord?: BimiRecordInfo }).bimiRecord;
          if (rec) setBimiRecord(rec);
        } else {
          setError("Unknown error");
        }
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  // Auto-submit when fingerprint or domain is provided via URL (once per unique value)
  useEffect(() => {
    const fp = searchParams.get("fingerprint");
    const d = searchParams.get("domain");
    const s = searchParams.get("selector") ?? "default";
    const key = fp ? `fp:${fp}` : d ? `d:${d}:${s}` : null;
    if (!key || autoSubmittedRef.current === key) return;
    autoSubmittedRef.current = key;
    if (fp) {
      setFingerprint(fp);
      setActiveTab("fingerprint");
      submit({ fingerprint: fp });
    } else if (d) {
      setDomain(d);
      setSelector(s);
      setActiveTab("domain");
      submit({ domain: d, selector: s });
    }
  }, [searchParams, submit]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setPem(text);
      setActiveTab("pem");
      submit({ pem: text.trim() });
    };
    reader.readAsText(file);
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current++;
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragging(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  return (
    <div
      className="space-y-6"
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
    >
      {dragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-primary p-12 text-center">
            <p className="text-lg font-medium">Drop PEM file to lint</p>
            <p className="text-sm text-muted-foreground mt-1">Certificate will be parsed and linted automatically</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Certificate Input</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="domain">Domain</TabsTrigger>
              <TabsTrigger value="pem">Paste PEM</TabsTrigger>
              <TabsTrigger value="url">Fetch URL</TabsTrigger>
              <TabsTrigger value="fingerprint">Lookup Fingerprint</TabsTrigger>
            </TabsList>

            <TabsContent value="domain">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (domain.trim()) submit({ domain: domain.trim(), selector: selector.trim() || "default" });
                }}
                className="space-y-3"
              >
                <Input placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">Selector</span>
                  <Input
                    placeholder="default"
                    value={selector === "default" ? "" : selector}
                    onChange={(e) => setSelector(e.target.value || "default")}
                    className="max-w-[200px]"
                  />
                </div>
                <Button type="submit" disabled={loading || !domain.trim()}>
                  {loading ? "Looking up…" : "Lookup & Lint"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="pem">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (pem.trim() && !pemSizeError) submit({ pem: pem.trim() });
                }}
                className="space-y-3"
              >
                <label htmlFor="pem-textarea" className="sr-only">
                  Certificate PEM
                </label>
                <Textarea
                  id="pem-textarea"
                  placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                  value={pem}
                  onChange={(e) => {
                    setPem(e.target.value);
                    setPemSizeError(e.target.value.length > 100_000);
                  }}
                  rows={8}
                  className="font-mono text-xs"
                />
                {pemSizeError && <p className="text-xs text-destructive">PEM exceeds 100KB limit</p>}
                <Button type="submit" disabled={loading || !pem.trim() || pemSizeError}>
                  {loading ? "Linting…" : "Lint Certificate"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="url">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (url.trim()) submit({ url: url.trim() });
                }}
                className="space-y-3"
              >
                <Input
                  type="url"
                  placeholder="https://example.com/cert.pem"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <Button type="submit" disabled={loading || !url.trim()}>
                  {loading ? "Fetching…" : "Fetch & Lint"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="fingerprint">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (fingerprint.trim()) submit({ fingerprint: fingerprint.trim() });
                }}
                className="space-y-3"
              >
                <Input
                  placeholder="SHA-256 fingerprint (hex)"
                  value={fingerprint}
                  onChange={(e) => setFingerprint(e.target.value)}
                  className="font-mono text-xs"
                />
                <Button type="submit" disabled={loading || !fingerprint.trim()}>
                  {loading ? "Looking up…" : "Lookup & Lint"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
            {lastBodyRef.current && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => submit(lastBodyRef.current!)}>
                Retry
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {bimiRecord && <BimiRecordCard record={bimiRecord} />}

      {loading && !response && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {response?.cert && <CertSummaryCard cert={response.cert} />}
      {response && <LintResults results={response.results} summary={response.summary} cert={response.cert} />}
    </div>
  );
}
