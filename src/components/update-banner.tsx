"use client";

import { useVersionCheck } from "@/lib/use-version-check";

export function UpdateBanner() {
  const stale = useVersionCheck();
  if (!stale) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <button
        onClick={() => window.location.reload()}
        className="rounded-lg border bg-background/95 backdrop-blur px-3 py-2 text-xs text-muted-foreground shadow-lg hover:text-foreground transition-colors"
      >
        New version available. Click to refresh.
      </button>
    </div>
  );
}
