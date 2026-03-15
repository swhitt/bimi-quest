import type { Metadata } from "next";
import { Suspense } from "react";
import { LintForm } from "@/components/lint/lint-form";

export const metadata: Metadata = {
  alternates: { canonical: "/tools/lint" },
  title: "BIMI Certificate Linter",
  description:
    "Lint BIMI VMC/CMC certificates against MCR v1.7, RFC 3709, RFC 5280, and CA/Browser Forum requirements.",
};

export default function LintPage() {
  return (
    <div className="container mx-auto max-w-3xl py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">BIMI Certificate Linter</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Validate VMC/CMC certificates against MCR v1.7, RFC 3709, RFC 5280, and CABF requirements.
        </p>
      </div>
      <Suspense>
        <LintForm />
      </Suspense>
    </div>
  );
}
