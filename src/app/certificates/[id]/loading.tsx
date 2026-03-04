import { Skeleton } from "@/components/ui/skeleton";

export default function CertificateDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Skeleton className="h-5 w-72" />
      {/* Title row */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      {/* Main content grid: detail card + logo */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-[200px] w-full rounded-xl" />
          <Skeleton className="h-[160px] w-full rounded-xl" />
        </div>
      </div>
      {/* Extensions / PEM sections */}
      <Skeleton className="h-[200px] w-full rounded-xl" />
    </div>
  );
}
