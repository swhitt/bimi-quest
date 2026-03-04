"use client";

import { CopyButton } from "@/components/ui/copy-button";
import { Button } from "@/components/ui/button";
import type { DecodedCTEntry } from "@/lib/ct/decode-entry";
import { Download } from "lucide-react";

interface RawDataPanelProps {
  raw: DecodedCTEntry["raw"];
  certPem: string | null;
}

function RawSection({ label, data, downloadFilename }: { label: string; data: string; downloadFilename?: string }) {
  function handleDownload() {
    const blob = new Blob([data], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFilename!;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          <CopyButton value={data} />
          {downloadFilename && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleDownload} title="Download">
              <Download className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
      <pre className="font-mono text-[11px] leading-tight bg-muted/30 rounded-md p-2 overflow-x-auto max-h-40 break-all whitespace-pre-wrap">
        {data}
      </pre>
    </div>
  );
}

export function RawDataPanel({ raw, certPem }: RawDataPanelProps) {
  return (
    <div className="space-y-3">
      {certPem && <RawSection label="Certificate (PEM)" data={certPem} downloadFilename="certificate.pem" />}
      <RawSection label="Leaf Input (base64)" data={raw.leafInput} />
      <RawSection label="Extra Data (base64)" data={raw.extraData} />
      <RawSection label="Leaf Hex" data={raw.leafHex} />
    </div>
  );
}
