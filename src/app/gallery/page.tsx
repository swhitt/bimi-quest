import type { Metadata } from "next";
import { Suspense } from "react";
import { GalleryContent } from "./gallery-content";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Logo Gallery",
  description:
    "Browse BIMI logos from VMC and CMC certificates discovered in Certificate Transparency logs.",
};

export default function GalleryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Logo Gallery</h1>
        <p className="text-muted-foreground">
          Browse unique BIMI logos discovered from certificate transparency logs.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-15">
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
