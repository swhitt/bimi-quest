"use client";

import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (online) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="rounded-lg border bg-background/95 backdrop-blur px-3 py-2 text-xs text-muted-foreground shadow-lg">
        You&apos;re offline &mdash; data may be stale
      </div>
    </div>
  );
}
