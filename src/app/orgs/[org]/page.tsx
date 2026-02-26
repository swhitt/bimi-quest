import type { Metadata } from "next";
import { Suspense } from "react";
import { OrgContent } from "./org-content";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  params: Promise<{ org: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org } = await params;
  const decoded = decodeURIComponent(org);
  return {
    title: `Certificates for ${decoded}`,
    description: `Browse all BIMI VMC and CMC certificates issued to ${decoded}.`,
  };
}

export default async function OrgPage({ params }: Props) {
  const { org } = await params;
  const decoded = decodeURIComponent(org);
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-[500px] w-full rounded-xl" />
        </div>
      }
    >
      <OrgContent org={decoded} />
    </Suspense>
  );
}
