"use client";

import { UniversalSearch } from "./universal-search";

export function HeroSearch() {
  return (
    <div className="py-2">
      <div className="max-w-2xl mx-auto text-center space-y-2">
        <h1 className="text-xl font-semibold">BIMI Quest</h1>
        <UniversalSearch variant="hero" />
      </div>
    </div>
  );
}
