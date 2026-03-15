import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ValidateContent } from "./validate-content";

export const metadata: Metadata = {
  title: "BIMI Check",
  description: "Check any domain's BIMI setup including DMARC policy, DNS records, SVG logo, and VMC/CMC certificates.",
  openGraph: {
    title: "BIMI Check — Validate Any Domain",
    description:
      "Check any domain's BIMI readiness: DNS records, DMARC policy, SVG logo compliance, and VMC/CMC certificate status.",
    images: [{ url: "/api/og/default", width: 1200, height: 630 }],
  },
};

export default async function ValidatePage() {
  await connection();
  return (
    <Suspense>
      <ValidateContent />
    </Suspense>
  );
}
