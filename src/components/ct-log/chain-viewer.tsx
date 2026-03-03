"use client";

import { cn } from "@/lib/utils";
import type { DecodedCert, DecodedChainCert } from "@/lib/ct/decode-entry";

interface ChainViewerProps {
  chain: DecodedChainCert[];
  cert: DecodedCert | null;
}

function ChainCard({
  subject,
  issuer,
  highlight,
  label,
}: {
  subject: string;
  issuer: string;
  highlight?: boolean;
  label?: string;
}) {
  return (
    <div className={cn("rounded-md border px-3 py-2 text-sm", highlight && "border-primary/50 bg-accent/50")}>
      {label && <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>}
      <p className="font-medium truncate">{subject}</p>
      <p className="text-xs text-muted-foreground truncate">Issued by: {issuer}</p>
    </div>
  );
}

export function ChainViewer({ chain, cert }: ChainViewerProps) {
  if (!cert && chain.length === 0) {
    return <p className="text-sm text-muted-foreground">No chain data available.</p>;
  }

  return (
    <div className="space-y-0">
      {/* End entity */}
      {cert && <ChainCard subject={cert.subject} issuer={cert.issuer} highlight label="End Entity" />}

      {/* Chain certs */}
      {chain.map((c, i) => (
        <div key={`${c.subject}-${i}`} className="flex">
          <div className="w-5 flex flex-col items-center">
            <div className="w-0.5 h-2 bg-border" />
            <div className="size-1.5 rounded-full bg-border shrink-0" />
            <div className="w-0.5 h-2 bg-border" />
          </div>
          <div className="flex-1 min-w-0">
            <ChainCard
              subject={c.subject}
              issuer={c.issuer}
              label={i === chain.length - 1 ? "Root CA" : `Intermediate ${i + 1}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
