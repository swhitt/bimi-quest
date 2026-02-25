import type { Metadata } from "next";
import { Suspense } from "react";
import { CertificatesContent } from "./certificates-content";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Certificates",
  description: "Browse and filter all BIMI VMC and CMC certificates discovered from Certificate Transparency logs.",
};

export default function CertificatesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Certificates</h1>
        <p className="text-muted-foreground">
          Browse and filter all BIMI certificates discovered from CT logs.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-[500px] w-full rounded-xl" />
          </div>
        }
      >
        <CertificatesContent />
      </Suspense>
    </div>
  );
}
