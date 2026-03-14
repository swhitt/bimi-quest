"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

interface LintResponse {
  results: LintResult[];
  summary: LintSummary;
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

export function LintForm() {
  const searchParams = useSearchParams();
  const [domain, setDomain] = useState("");
  const [pem, setPem] = useState("");
  const [url, setUrl] = useState("");
  const [fingerprint, setFingerprint] = useState(searchParams.get("fingerprint") ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bimiRecord, setBimiRecord] = useState<BimiRecordInfo | null>(null);
  const [response, setResponse] = useState<LintResponse | null>(null);
  const [activeTab, setActiveTab] = useState(searchParams.get("fingerprint") ? "fingerprint" : "domain");
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  const submit = useCallback(async (body: Record<string, string>) => {
    setLoading(true);
    setError(null);
    setBimiRecord(null);
    setResponse(null);
    try {
      const data = await fetchLint(body);
      setResponse(data);
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
  }, []);

  // Auto-submit when fingerprint is provided via URL
  useEffect(() => {
    const fp = searchParams.get("fingerprint");
    if (fp) {
      setFingerprint(fp);
      setActiveTab("fingerprint");
      submit({ fingerprint: fp });
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
                  if (domain.trim()) submit({ domain: domain.trim() });
                }}
                className="space-y-3"
              >
                <Input placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Looks up the BIMI DNS record, fetches the certificate from the authority URL, and lints it.
                </p>
                <Button type="submit" disabled={loading || !domain.trim()}>
                  {loading ? "Looking up…" : "Lookup & Lint"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="pem">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (pem.trim()) submit({ pem: pem.trim() });
                }}
                className="space-y-3"
              >
                <Textarea
                  placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                  value={pem}
                  onChange={(e) => setPem(e.target.value)}
                  rows={8}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">Or drag &amp; drop a PEM file anywhere on this page.</p>
                <Button type="submit" disabled={loading || !pem.trim()}>
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
          </CardContent>
        </Card>
      )}

      {bimiRecord && <BimiRecordCard record={bimiRecord} />}

      {response && <LintResults results={response.results} summary={response.summary} />}
    </div>
  );
}
