"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { SUMMARY_BADGE_COLORS } from "@/lib/colors";
import { lintPem, summarize } from "@/lib/lint/lint";
import { LintResults } from "@/components/lint/lint-results";

interface LintSectionProps {
  rawPem: string;
}

export function LintSection({ rawPem }: LintSectionProps) {
  const results = useMemo(() => lintPem(rawPem), [rawPem]);
  const summary = useMemo(() => summarize(results), [results]);
  const [open, setOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Auto-open and scroll if URL hash is #lint
  useEffect(() => {
    if (window.location.hash === "#lint" && detailsRef.current) {
      detailsRef.current.open = true;
      detailsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <details ref={detailsRef} id="lint" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer list-none flex items-center gap-2 rounded-lg border px-4 py-3 hover:bg-accent/50 transition-colors [&::-webkit-details-marker]:hidden">
        <svg
          className={`size-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        <span className="font-medium text-sm">Certificate Lint</span>
        <div className="flex gap-1.5 ml-auto">
          {summary.errors > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {summary.errors} error{summary.errors !== 1 ? "s" : ""}
            </Badge>
          )}
          {summary.warnings > 0 && (
            <Badge variant="outline" className={`text-[10px] ${SUMMARY_BADGE_COLORS.warnings}`}>
              {summary.warnings} warning{summary.warnings !== 1 ? "s" : ""}
            </Badge>
          )}
          <Badge variant="outline" className={`text-[10px] ${SUMMARY_BADGE_COLORS.passed}`}>
            {summary.passed} passed
          </Badge>
        </div>
      </summary>
      <div className="mt-3">
        <LintResults results={results} summary={summary} />
      </div>
    </details>
  );
}
