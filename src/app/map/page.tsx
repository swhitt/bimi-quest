import type { Metadata } from "next";
import { Suspense } from "react";
import { MapContent } from "./map-content";

export const metadata: Metadata = {
  title: "Geographic Distribution",
  description: "Global BIMI certificate distribution by country. See which regions are adopting BIMI.",
};

export default function MapPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Geographic Distribution</h1>
        <p className="text-muted-foreground">
          BIMI certificate distribution by country.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            Loading geographic data...
          </div>
        }
      >
        <MapContent />
      </Suspense>
    </div>
  );
}
