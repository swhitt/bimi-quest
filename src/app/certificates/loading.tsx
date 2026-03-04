import { Skeleton } from "@/components/ui/skeleton";

export default function CertificatesLoading() {
  return (
    <div className="sm:space-y-8">
      <div className="hidden sm:block">
        <h1 className="text-2xl font-semibold">Certificates</h1>
        <p className="text-sm text-muted-foreground">
          Browse and filter all BIMI certificates discovered from CT logs.
        </p>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[500px] w-full rounded-xl" />
      </div>
    </div>
  );
}
