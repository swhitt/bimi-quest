"use client";

import { UniversalSearch } from "./universal-search";

export function HeroSearch() {
  return (
    <div className="py-4">
      <div className="max-w-2xl mx-auto text-center space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">BIMI Quest</h1>
          <p className="text-sm text-muted-foreground mt-1">
            BIMI certificate intelligence
          </p>
        </div>
        <UniversalSearch variant="hero" />
      </div>
    </div>
  );
}
