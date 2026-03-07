import type { Metadata } from "next";
import { connection } from "next/server";
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
    // Default preset is "recent": newest certificates first
    const params = new URLSearchParams({
      sort: "recent",
      minScore: "1",
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
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">Logo Gallery</h1>
      <GalleryContent
        initialLogos={initialGallery?.logos ?? undefined}
        initialTotal={initialGallery?.total ?? undefined}
      />
    </div>
  );
}
