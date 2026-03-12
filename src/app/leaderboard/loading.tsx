import { Skeleton } from "@/components/ui/skeleton";

export default function LeaderboardLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-[500px] w-full rounded-xl" />
    </div>
  );
}
