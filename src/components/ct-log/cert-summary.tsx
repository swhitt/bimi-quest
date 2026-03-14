"use client";

import Link from "next/link";
import { useState } from "react";
import { CertChip } from "@/components/cert-chip";
import { HostnameLink } from "@/components/hostname-link";
import { OrgChip } from "@/components/org-chip";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CopyButton } from "@/components/ui/copy-button";
import { ChainLinkIcon, ExternalArrowIcon } from "@/components/ui/icons";
import { UtcTime } from "@/components/ui/utc-time";
import { logoUrl } from "@/lib/entity-urls";
import type { DecodedCert, DecodedLeaf } from "@/lib/ct/decode-entry";

interface CertSummaryProps {
  cert: DecodedCert;
  leaf: DecodedLeaf;
}

function formatDate(iso: string): string {
  return iso.slice(0, 19).replace("T", " ") + " UTC";
}

function ValidityBar({ notBefore, notAfter, now }: { notBefore: string; notAfter: string; now: number }) {
  const start = new Date(notBefore).getTime();
  const end = new Date(notAfter).getTime();
  const total = end - start;
  const elapsed = now - start;
  const pct = total > 0 ? Math.max(0, Math.min(100, (elapsed / total) * 100)) : 0;

  const daysLeft = Math.floor((end - now) / 86_400_000);
  const barColor = daysLeft < 0 ? "#ef4444" : daysLeft < 30 ? "#f59e0b" : "#22c55e";

  return (
    <div className="space-y-0.5">
      <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
        {pct > 0 && pct < 100 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 size-2.5 rounded-full border-2 border-background"
            style={{ left: `${pct}%`, backgroundColor: barColor, marginLeft: "-5px" }}
          />
        )}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{formatDate(notBefore)}</span>
        <span>
          {daysLeft < 0 ? `Expired ${Math.abs(daysLeft)}d ago` : daysLeft === 0 ? "Expires today" : `${daysLeft}d left`}
        </span>
        <span>{formatDate(notAfter)}</span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground whitespace-nowrap">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

export function CertSummary({ cert, leaf }: CertSummaryProps) {
  const [now] = useState(() => Date.now());
  const keyDesc = cert.keySize ? `${cert.publicKeyAlg} ${cert.keySize}` : cert.publicKeyAlg;

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        {cert.isBIMI && (
          <Field label="BIMI">
            <div className="flex items-center gap-2">
              <CertChip
                fingerprint={cert.fingerprint}
                label={cert.certType ?? "BIMI"}
                compact
                className="text-emerald-500 font-medium"
              />
              {cert.markType != null && <span className="text-xs text-muted-foreground">({cert.markType})</span>}
              {cert.logotypeSvg && (
                <Link
                  href={logoUrl(cert.fingerprint)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title="Share logo"
                >
                  <ChainLinkIcon />
                  Share
                </Link>
              )}
            </div>
          </Field>
        )}
        <Field label="Subject">
          <span className="truncate block">{cert.subject}</span>
        </Field>
        {cert.organization != null && (
          <Field label="Organization">
            <OrgChip org={cert.organization} size="xs" compact />
          </Field>
        )}
        <Field label="Issuer">
          <span className="truncate block">{cert.issuer}</span>
        </Field>
        <Field label="Serial">
          <div className="flex items-center gap-1 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-mono text-xs truncate block cursor-help">{cert.serial}</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-80">
                <p className="font-mono break-all">{cert.serial}</p>
              </TooltipContent>
            </Tooltip>
            <CopyButton value={cert.serial} />
          </div>
        </Field>
        <Field label="Not Before">
          <UtcTime date={cert.notBefore} showTime />
        </Field>
        <Field label="Not After">
          <UtcTime date={cert.notAfter} showTime />
        </Field>
        <Field label="SANs">
          {cert.sans.length > 0 ? (
            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
              {cert.sans.map((san) => (
                <HostnameLink key={san} hostname={san} size="xs" />
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </Field>
        <Field label="Fingerprint">
          <div className="flex items-center gap-1 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-mono text-xs truncate block cursor-help">{cert.fingerprint}</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-80">
                <p className="font-mono break-all">{cert.fingerprint}</p>
              </TooltipContent>
            </Tooltip>
            <CopyButton value={cert.fingerprint} />
            <a
              href={`https://crt.sh/?q=${cert.fingerprint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:bg-secondary"
            >
              crt.sh
              <ExternalArrowIcon className="size-2.5" />
            </a>
            <Link
              href={`/tools/lint?fingerprint=${cert.fingerprint}`}
              className="shrink-0 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:bg-secondary"
            >
              Lint
            </Link>
          </div>
        </Field>
        <Field label="Sig Algo">
          <span>{cert.signatureAlg}</span>
        </Field>
        <Field label="Public Key">
          <span>{keyDesc}</span>
        </Field>
        {cert.keyUsage.length > 0 && (
          <Field label="Key Usage">
            <div className="flex flex-wrap gap-1">
              {cert.keyUsage.map((ku) => (
                <Badge key={ku} variant="secondary" className="text-[10px] px-1.5">
                  {ku}
                </Badge>
              ))}
            </div>
          </Field>
        )}
        {cert.extKeyUsage.length > 0 && (
          <Field label="Ext Key Usage">
            <span className="text-xs">{cert.extKeyUsage.join(", ")}</span>
          </Field>
        )}
        <Field label="Extensions">
          <details className="group">
            <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground select-none">
              {cert.extensions.length} extension{cert.extensions.length !== 1 ? "s" : ""}
              <span className="ml-1 group-open:hidden">▸</span>
              <span className="ml-1 hidden group-open:inline">▾</span>
            </summary>
            <ul className="mt-1 space-y-0.5">
              {cert.extensions.map((ext) => (
                <li key={ext.oid} className="flex items-center gap-1.5 text-xs">
                  <span className="font-mono text-[10px] text-muted-foreground">{ext.name ?? ext.oid}</span>
                  {ext.critical && (
                    <Badge variant="destructive" className="text-[9px] px-1 py-0 leading-tight">
                      critical
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </Field>
        <Field label="Timestamp">
          <UtcTime date={leaf.timestampDate} showTime />
        </Field>
        <Field label="Entry Type">
          <Badge variant={leaf.entryType === "x509_entry" ? "secondary" : "outline"} className="text-[10px] px-1.5">
            {leaf.entryType === "x509_entry" ? "X.509" : "Precert"}
          </Badge>
        </Field>
      </dl>

      <ValidityBar notBefore={cert.notBefore} notAfter={cert.notAfter} now={now} />
    </div>
  );
}
