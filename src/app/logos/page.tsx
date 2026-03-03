import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getBaseUrl } from "@/lib/server-url";
import { GalleryContent, type GalleryResponse } from "./gallery-content";

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

/** Fetch the default gallery page server-side for instant rendering. */
async function fetchInitialLogos(): Promise<GalleryResponse | null> {
  try {
    const baseUrl = await getBaseUrl();
    // Default preset is "full-color": sort=quality, minScore=1, minColorRichness=7
    const params = new URLSearchParams({
      sort: "quality",
      minScore: "1",
      minColorRichness: "7",
      page: "1",
      limit: "100",
      dedupSvg: "true",
    });
    const res = await fetch(`${baseUrl}/api/logos?${params}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as GalleryResponse;
  } catch {
    return null;
  }
}

export default async function GalleryPage() {
  await connection();
  const initialGallery = await fetchInitialLogos();

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
        <GalleryContent
          initialLogos={initialGallery?.logos ?? undefined}
          initialTotal={initialGallery?.total ?? undefined}
        />
      </Suspense>
    </div>
  );
}
