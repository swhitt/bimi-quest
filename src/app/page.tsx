import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardContent } from "./dashboard-content";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Real-time BIMI certificate market intelligence. Track VMC and CMC issuances, CA market share, and industry adoption from CT logs.",
  openGraph: {
    title: "BIMI Quest — Certificate Market Intelligence Dashboard",
    description:
      "Track VMC and CMC certificate issuances across all Certificate Authorities. Real-time market intelligence from Certificate Transparency logs.",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BIMI Quest — Certificate Market Intelligence Dashboard",
    description:
      "Track VMC and CMC certificate issuances across all Certificate Authorities. Real-time market intelligence from Certificate Transparency logs.",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
};

export default async function DashboardPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;

  return (
    <div className="space-y-6">
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Hero + secondary KPI strip */}
      <div className="space-y-2">
        <Skeleton className="h-[60px] w-64 rounded-lg" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[48px] rounded-lg" />
          ))}
        </div>
      </div>
      {/* 3-col chart row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-[320px] rounded-xl" />
        <Skeleton className="h-[320px] rounded-xl" />
        <Skeleton className="h-[320px] rounded-xl" />
      </div>
      {/* Industry (3) / Expiry (2) */}
      <div className="grid gap-4 md:grid-cols-5">
        <Skeleton className="h-[320px] rounded-xl md:col-span-3" />
        <Skeleton className="h-[320px] rounded-xl md:col-span-2" />
      </div>
      {/* TopOrgs (2) / RecentCerts (3) */}
      <div className="grid gap-4 md:grid-cols-5">
        <Skeleton className="h-[280px] rounded-xl md:col-span-2" />
        <Skeleton className="h-[280px] rounded-xl md:col-span-3" />
      </div>
    </div>
  );
}
