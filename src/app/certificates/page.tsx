import type { Metadata } from "next";
import { Suspense } from "react";
import { CertificatesContent } from "./certificates-content";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Certificates",
  description: "Browse and filter all BIMI VMC and CMC certificates discovered from Certificate Transparency logs.",
  openGraph: {
    title: "BIMI Certificate Database — All VMC & CMC Certificates",
    description:
      "Browse and search every BIMI VMC and CMC certificate discovered from Certificate Transparency logs. Filter by issuer, industry, country, and more.",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
};

export default async function CertificatesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Certificates</h1>
        <p className="text-sm text-muted-foreground">
          Browse and filter all BIMI certificates discovered from CT logs.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-[500px] w-full rounded-xl" />
          </div>
        }
      >
        <CertificatesContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
