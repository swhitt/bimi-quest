"use client";

import { CopyButton } from "@/components/ui/copy-button";
import type { BimiCheckItem } from "@/lib/bimi/types";

interface CAAEntry {
  critical: number;
  tag: string;
  value: string;
}

interface CAAData {
  status: "permissive" | "standard_only" | "vmc_authorized";
  entries: CAAEntry[];
  issueVmcEntries: CAAEntry[];
  authorizedCAs: string[];
}

interface TechnicalDetailsProps {
  authResult?: string;
  responseHeaders?: Record<string, string>;
  rngChecks?: BimiCheckItem[];
  rawBimiRecord?: string | null;
  rawDmarcRecord?: string | null;
  caa?: CAAData | null;
}

export function TechnicalDetails({
  authResult,
  responseHeaders,
  rngChecks,
  rawBimiRecord,
  rawDmarcRecord,
  caa,
}: TechnicalDetailsProps) {
  const hasContent = authResult || responseHeaders || rngChecks?.length || rawBimiRecord || rawDmarcRecord || caa;

  if (!hasContent) return null;

  return (
    <details className="group">
      <summary className="cursor-pointer text-sm font-medium text-primary hover:underline list-none flex items-center gap-1">
        <span className="group-open:rotate-90 transition-transform">&#x25B6;</span>
        Technical Deep Dive
      </summary>
      <div className="mt-4 space-y-4">
        {responseHeaders && Object.keys(responseHeaders).length > 0 && (
          <section>
            <h4 className="text-sm font-medium mb-2">BIMI Response Headers</h4>
            <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto">
              {Object.entries(responseHeaders).map(([key, value]) => (
                <HeaderLine key={key} name={key} value={value} />
              ))}
            </pre>
          </section>
        )}

        {authResult && (
          <section>
            <h4 className="text-sm font-medium mb-2">Authentication-Results</h4>
            <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">
              {authResult}
            </pre>
          </section>
        )}

        {rngChecks && rngChecks.length > 0 && (
          <section>
            <h4 className="text-sm font-medium mb-2">SVG RNG Schema Report</h4>
            <div className="space-y-1">
              {rngChecks.map((check, i) => (
                <div key={i} className="text-xs">
                  <span
                    className={check.status === "pass" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}
                  >
                    {check.status === "pass" ? "\u2713" : "\u2717"}
                  </span>{" "}
                  {check.summary}
                </div>
              ))}
            </div>
          </section>
        )}

        {(rawBimiRecord || rawDmarcRecord) && (
          <section>
            <h4 className="text-sm font-medium mb-2">Raw DNS Records</h4>
            {rawBimiRecord && (
              <div className="mb-2">
                <span className="text-xs text-muted-foreground">BIMI TXT:</span>
                <pre className="text-xs bg-muted rounded-md p-2 mt-1 break-all whitespace-pre-wrap">
                  {rawBimiRecord}
                </pre>
              </div>
            )}
            {rawDmarcRecord && (
              <div>
                <span className="text-xs text-muted-foreground">DMARC TXT:</span>
                <pre className="text-xs bg-muted rounded-md p-2 mt-1 break-all whitespace-pre-wrap">
                  {rawDmarcRecord}
                </pre>
              </div>
            )}
          </section>
        )}

        {caa && caa.entries.length > 0 && (
          <section>
            <h4 className="text-sm font-medium mb-2">CAA Records</h4>
            <div className="space-y-1">
              {caa.entries.map((entry, i) => (
                <pre key={i} className="text-xs bg-muted rounded-md p-2 break-all whitespace-pre-wrap">
                  {entry.critical} {entry.tag} &quot;{entry.value}&quot;
                </pre>
              ))}
            </div>
          </section>
        )}
      </div>
    </details>
  );
}

function HeaderLine({ name, value }: { name: string; value: string }) {
  const truncated = value.length > 64;
  const display = truncated ? value.slice(0, 64) + "..." : value;

  return (
    <div className="flex items-start gap-1">
      <span>
        {name}: {display}
      </span>
      {truncated && <CopyButton value={`${name}: ${value}`} label={name} />}
      {"\n"}
    </div>
  );
}
