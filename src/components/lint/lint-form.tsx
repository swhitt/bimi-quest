"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { LintResult, LintSummary } from "@/lib/lint/types";
import { LintResults } from "./lint-results";

interface LintResponse {
  results: LintResult[];
  summary: LintSummary;
}

async function fetchLint(body: Record<string, string>): Promise<LintResponse> {
  const res = await fetch("/api/lint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export function LintForm() {
  const searchParams = useSearchParams();
  const [pem, setPem] = useState("");
  const [url, setUrl] = useState("");
  const [fingerprint, setFingerprint] = useState(searchParams.get("fingerprint") ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<LintResponse | null>(null);
  const [activeTab, setActiveTab] = useState(searchParams.get("fingerprint") ? "fingerprint" : "pem");

  const submit = useCallback(async (body: Record<string, string>) => {
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const data = await fetchLint(body);
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Certificate Input</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="pem">Paste PEM</TabsTrigger>
              <TabsTrigger value="url">Fetch URL</TabsTrigger>
              <TabsTrigger value="fingerprint">Lookup Fingerprint</TabsTrigger>
            </TabsList>

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

      {response && <LintResults results={response.results} summary={response.summary} />}
    </div>
  );
}
