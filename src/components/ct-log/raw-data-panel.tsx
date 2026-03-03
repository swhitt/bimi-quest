"use client";

import { CopyButton } from "@/components/ui/copy-button";
import type { DecodedCTEntry } from "@/lib/ct/decode-entry";

interface RawDataPanelProps {
  raw: DecodedCTEntry["raw"];
}

function RawSection({ label, data }: { label: string; data: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <CopyButton value={data} />
      </div>
      <pre className="font-mono text-[11px] leading-tight bg-muted/30 rounded-md p-2 overflow-x-auto max-h-40 break-all whitespace-pre-wrap">
        {data}
      </pre>
    </div>
  );
}

export function RawDataPanel({ raw }: RawDataPanelProps) {
  return (
    <div className="space-y-3">
      <RawSection label="Leaf Input (base64)" data={raw.leafInput} />
      <RawSection label="Extra Data (base64)" data={raw.extraData} />
      <RawSection label="Leaf Hex" data={raw.leafHex} />
    </div>
  );
}
