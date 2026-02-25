import { Suspense } from "react";
import { DashboardContent } from "./dashboard-content";
import { DomainSearch } from "@/components/domain-search";
import { Skeleton } from "@/components/ui/skeleton";

// Use the default title from layout.tsx metadata template
export const metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Track BIMI (Brand Indicators for Message Identification) certificate adoption across all Certificate Authorities.
        </p>
      </div>
      <details className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
          What is BIMI?
        </summary>
        <div className="mt-2 space-y-2 text-muted-foreground">
          <p>BIMI lets organizations display their verified brand logo next to emails in Gmail, Apple Mail, and Yahoo Mail. It builds on DMARC email authentication to prove messages genuinely come from the claimed sender.</p>
          <p>Organizations need a DMARC policy of "quarantine" or "reject", an SVG Tiny PS logo, and a Verified Mark Certificate (VMC) or Common Mark Certificate (CMC) from a Certificate Authority. This dashboard tracks all BIMI certificates issued via public Certificate Transparency logs.</p>
        </div>
      </details>
      <DomainSearch />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[350px] rounded-xl" />
        <Skeleton className="h-[350px] rounded-xl" />
      </div>
      <Skeleton className="h-[300px] rounded-xl" />
    </div>
  );
}
