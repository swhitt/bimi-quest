import type { Metadata } from "next";
import { Suspense } from "react";
import { ValidateContent } from "./validate-content";

export const metadata: Metadata = {
  title: "BIMI Validator",
  description: "Validate any domain's BIMI setup including DMARC policy, DNS records, SVG logo, and VMC/CMC certificates.",
};

export default function ValidatePage() {
  return (
    <Suspense>
      <ValidateContent />
    </Suspense>
  );
}
