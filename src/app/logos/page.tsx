import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { GalleryContent } from "./gallery-content";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Logo Gallery",
  description: "Browse BIMI logos from VMC and CMC certificates discovered in Certificate Transparency logs.",
  openGraph: {
    title: "Logo Gallery",
    description: "Browse BIMI logos from VMC and CMC certificates discovered in Certificate Transparency logs.",
    images: [{ url: "/api/og/gallery", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Logo Gallery",
    description: "Browse BIMI logos from VMC and CMC certificates discovered in Certificate Transparency logs.",
    images: [{ url: "/api/og/gallery", width: 1200, height: 630 }],
  },
};

export default async function GalleryPage() {
  await connection();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Logo Gallery</h1>
        <p className="text-sm text-muted-foreground">
          Browse unique BIMI logos discovered from certificate transparency logs.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
            {Array.from({ length: 60 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square w-full" />
            ))}
          </div>
        }
      >
        <GalleryContent />
      </Suspense>
    </div>
  );
}
