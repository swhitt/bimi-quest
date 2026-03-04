"use client";

import { cn } from "@/lib/utils";
import type { DecodedCert, DecodedChainCert } from "@/lib/ct/decode-entry";
import { CopyButton } from "@/components/ui/copy-button";

interface ChainViewerProps {
  chain: DecodedChainCert[];
  cert: DecodedCert | null;
}

function ChainCard({
  subject,
  issuer,
  notBefore,
  notAfter,
  fingerprint,
  isCA,
  highlight,
  label,
}: {
  subject: string;
  issuer: string;
  notBefore?: string;
  notAfter?: string;
  fingerprint?: string;
  isCA?: boolean;
  highlight?: boolean;
  label?: string;
}) {
  return (
    <div className={cn("rounded-md border px-3 py-2 text-sm", highlight && "border-primary/50 bg-accent/50")}>
      <div className="flex items-center gap-1.5 mb-0.5">
        {label && <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>}
        {isCA && (
          <span className="text-[10px] font-medium uppercase tracking-wide px-1 py-px rounded bg-muted text-muted-foreground leading-none">
            CA
          </span>
        )}
      </div>
      <p className="font-medium truncate">{subject}</p>
      <p className="text-xs text-muted-foreground truncate">Issued by: {issuer}</p>
      {notBefore && notAfter && (
        <p className="text-xs text-muted-foreground mt-0.5">
          {notBefore} &ndash; {notAfter}
        </p>
      )}
      {fingerprint && (
        <div className="flex items-center gap-1 mt-1">
          <p className="font-mono text-[11px] text-muted-foreground truncate">{fingerprint}</p>
          <CopyButton value={fingerprint} />
        </div>
      )}
    </div>
  );
}

export function ChainViewer({ chain, cert }: ChainViewerProps) {
  if (!cert && chain.length === 0) {
    return <p className="text-sm text-muted-foreground">No chain data available.</p>;
  }

  return (
    <div>
      {/* End entity */}
      {cert && <ChainCard subject={cert.subject} issuer={cert.issuer} highlight label="End Entity" />}

      {/* Chain certs */}
      {chain.map((c, i) => (
        <div key={i} className="flex">
          <div className="w-5 flex flex-col items-center">
            <div className="w-0.5 h-2 bg-border" />
            <div className="size-1.5 rounded-full bg-border shrink-0" />
            <div className="w-0.5 h-2 bg-border" />
          </div>
          <div className="flex-1 min-w-0">
            <ChainCard
              subject={c.subject}
              issuer={c.issuer}
              notBefore={c.notBefore}
              notAfter={c.notAfter}
              fingerprint={c.fingerprint}
              isCA={c.isCA}
              label={c.isSelfSigned ? "Root CA" : `Intermediate ${i + 1}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
