"use client";

import { ExternalLink, Shield } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CopyButton } from "@/components/ui/copy-button";
import type { DecodedCert, DecodedLeaf } from "@/lib/ct/decode-entry";

interface CertSummaryProps {
  cert: DecodedCert;
  leaf: DecodedLeaf;
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
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
        <Field label="Subject">
          <span className="truncate block">{cert.subject}</span>
        </Field>
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
          <span className="tabular-nums">{formatDate(cert.notBefore)}</span>
        </Field>
        <Field label="Not After">
          <span className="tabular-nums">{formatDate(cert.notAfter)}</span>
        </Field>
        <Field label="SANs">
          {cert.sans.length > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate block cursor-help">{cert.sans.join(", ")}</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-96">
                <p className="break-all">{cert.sans.join(", ")}</p>
              </TooltipContent>
            </Tooltip>
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
              <ExternalLink className="size-2.5" />
            </a>
          </div>
        </Field>
        <Field label="Sig Algo">
          <span>{cert.signatureAlg}</span>
        </Field>
        <Field label="Public Key">
          <span>{keyDesc}</span>
        </Field>
        <Field label="Extensions">
          <span className="tabular-nums">{cert.extensionOIDs.length}</span>
        </Field>
        <Field label="Timestamp">
          <span className="tabular-nums">{leaf.timestampDate}</span>
        </Field>
        <Field label="Entry Type">
          <Badge variant={leaf.entryType === "x509_entry" ? "secondary" : "outline"} className="text-[10px] px-1.5">
            {leaf.entryType === "x509_entry" ? "X.509" : "Precert"}
          </Badge>
        </Field>
        {cert.isBIMI && (
          <Field label="BIMI">
            <Link
              href={`/certificates/${cert.fingerprint.slice(0, 12)}`}
              className="inline-flex items-center gap-1 text-emerald-500 font-medium hover:underline"
            >
              <Shield className="size-3.5" />
              VMC/CMC
              <ExternalLink className="size-3" />
            </Link>
          </Field>
        )}
      </dl>

      <ValidityBar notBefore={cert.notBefore} notAfter={cert.notAfter} now={now} />
    </div>
  );
}
