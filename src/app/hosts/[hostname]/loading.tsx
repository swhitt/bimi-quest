import { Skeleton } from "@/components/ui/skeleton";

export default function HostLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-[500px] w-full rounded-xl" />
    </div>
  );
}
