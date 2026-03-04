import type { Metadata } from "next";
import { Suspense } from "react";
import { MapContent } from "./map-content";

export const metadata: Metadata = {
  title: "Geographic Distribution",
  description: "Global BIMI certificate distribution by country. See which regions are adopting BIMI.",
  openGraph: {
    title: "Geographic BIMI Distribution — Who's Adopting BIMI Worldwide",
    description:
      "Explore the global adoption of BIMI certificates by country. Interactive map of VMC and CMC issuances from CT logs.",
    images: [{ url: "/api/og/default", width: 1200, height: 630 }],
  },
};

export default async function MapPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParams = await props.searchParams;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Geographic Distribution</h1>
        <p className="text-sm text-muted-foreground">BIMI certificate distribution by country.</p>
      </div>
      <Suspense
        fallback={
          <div className="flex h-64 items-center justify-center text-muted-foreground">Loading geographic data...</div>
        }
      >
        <MapContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
