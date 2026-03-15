import type { Metadata } from "next";
import { TransparencyContent } from "./transparency-content";

export const metadata: Metadata = {
  title: "CT Transparency Analysis — BIMI Quest",
  description:
    "Analysis of Certificate Transparency logging for VMC/CMC certificates: which logs they appear in, SCT distribution, and issuance-to-logging lag.",
};

export default function TransparencyPage() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">CT Transparency Analysis</h1>
        <p className="text-muted-foreground mt-1">
          How VMC/CMC certificates are logged to Certificate Transparency — which logs, how many SCTs, and the lag
          between issuance and logging.
        </p>
      </div>
      <TransparencyContent />
    </div>
  );
}
