import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
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
