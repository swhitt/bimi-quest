import { Skeleton } from "@/components/ui/skeleton";

export default function DomainsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[500px] w-full rounded-xl" />
    </div>
  );
}
