import type { Metadata } from "next";
import { Suspense } from "react";
import { HostContent } from "./host-content";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  params: Promise<{ hostname: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hostname } = await params;
  const decoded = decodeURIComponent(hostname).toLowerCase();
  return {
    title: `Certificates for ${decoded}`,
    description: `Browse all BIMI VMC and CMC certificates with ${decoded} as a Subject Alternative Name (SAN).`,
  };
}

export default async function HostPage({ params }: Props) {
  const { hostname } = await params;
  const decoded = decodeURIComponent(hostname).toLowerCase().replace(/\.$/, "");
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-[500px] w-full rounded-xl" />
        </div>
      }
    >
      <HostContent hostname={decoded} />
    </Suspense>
  );
}
