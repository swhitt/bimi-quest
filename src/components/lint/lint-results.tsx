"use client";

import { useState } from "react";
import { Check, ClipboardCopy, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { citationUrl } from "@/lib/lint/citation-urls";
import type { LintResult, LintSummary } from "@/lib/lint/types";

const STATUS_ICON: Record<string, { icon: string; color: string; ariaLabel: string }> = {
  pass: { icon: "\u2713", color: "text-emerald-600 dark:text-emerald-400", ariaLabel: "Passed" },
  fail: { icon: "\u2717", color: "text-destructive", ariaLabel: "Failed" },
  not_applicable: { icon: "\u2014", color: "text-muted-foreground", ariaLabel: "Not applicable" },
};

const SEVERITY_BADGE: Record<string, string> = {
  error: "bg-destructive/10 text-destructive border-destructive/30",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  notice: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
};

function ResultRow({ result }: { result: LintResult }) {
  const { icon, color, ariaLabel } = STATUS_ICON[result.status] ?? STATUS_ICON.not_applicable;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      <span className={`mt-0.5 text-lg font-bold leading-none ${color}`} aria-label={ariaLabel}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{result.title}</span>
          {result.status === "fail" && (
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${SEVERITY_BADGE[result.severity]}`}>
              {result.severity}
            </Badge>
          )}
          {(() => {
            const url = citationUrl(result.citation);
            return url ? (
              <a href={url} target="_blank" rel="noopener noreferrer">
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors cursor-pointer"
                >
                  {result.citation} ↗
                </Badge>
              </a>
            ) : (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                {result.citation}
              </Badge>
            );
          })()}
        </div>
        {result.detail && <p className="text-xs text-muted-foreground mt-0.5">{result.detail}</p>}
        <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">{result.rule}</p>
      </div>
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  MCR: "MCR (Mark Certificate Requirements)",
  RFC3709: "RFC 3709 (Logotype)",
  RFC5280: "RFC 5280 (X.509)",
  CABF: "CA/Browser Forum",
};

function resultsToMarkdown(results: LintResult[]): string {
  const lines = ["| Status | Rule | Title | Detail | Citation |", "| --- | --- | --- | --- | --- |"];
  for (const r of results) {
    const status = r.status === "pass" ? "Pass" : r.status === "fail" ? "Fail" : "N/A";
    const detail = (r.detail ?? "\u2014").replace(/\|/g, "\\|");
    lines.push(`| ${status} | ${r.rule} | ${r.title} | ${detail} | ${r.citation} |`);
  }
  return lines.join("\n");
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

interface LintResultsProps {
  results: LintResult[];
  summary: LintSummary;
  cert?: CertMeta;
}

export function LintResults({ results, summary, cert }: LintResultsProps) {
  const [mdCopied, setMdCopied] = useState(false);

  const grouped = new Map<string, LintResult[]>();
  for (const r of results) {
    const group = grouped.get(r.source) ?? [];
    group.push(r);
    grouped.set(r.source, group);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-center" role="status">
        {summary.errors > 0 && (
          <Badge variant="destructive">
            {summary.errors} error{summary.errors !== 1 ? "s" : ""}
          </Badge>
        )}
        {summary.warnings > 0 && (
          <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
            {summary.warnings} warning{summary.warnings !== 1 ? "s" : ""}
          </Badge>
        )}
        {summary.notices > 0 && (
          <Badge variant="outline" className="border-blue-500/50 text-blue-600 dark:text-blue-400">
            {summary.notices} notice{summary.notices !== 1 ? "s" : ""}
          </Badge>
        )}
        <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
          {summary.passed} passed
        </Badge>
        <div className="flex gap-1.5 ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const blob = new Blob([JSON.stringify({ cert, results, summary }, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "lint-results.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="size-3.5" />
            Export JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(resultsToMarkdown(results));
              setMdCopied(true);
              setTimeout(() => setMdCopied(false), 2000);
            }}
          >
            {mdCopied ? <Check className="size-3.5 text-emerald-500" /> : <ClipboardCopy className="size-3.5" />}
            {mdCopied ? "Copied!" : "Copy as Markdown"}
          </Button>
        </div>
      </div>

      {[...grouped.entries()].map(([source, items]) => {
        const fails = items.filter((r) => r.status === "fail").length;
        return (
          <Card key={source}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {SOURCE_LABELS[source] ?? source}
                {fails > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    {fails} fail{fails !== 1 ? "s" : ""}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {items.map((r, i) => (
                <ResultRow key={`${r.rule}-${i}`} result={r} />
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
