import { Skeleton } from "@/components/ui/skeleton";

export default function LogoDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="flex gap-6">
        <Skeleton className="h-48 w-48 rounded-xl" />
        <div className="space-y-3 flex-1">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <Skeleton className="h-[300px] w-full rounded-xl" />
    </div>
  );
}
