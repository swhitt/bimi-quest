"use client";

export function RetryButton() {
  return (
    <button
      onClick={() => window.location.reload()}
      className="rounded-lg border bg-background/95 px-4 py-2 text-sm font-medium text-foreground shadow-lg hover:bg-muted transition-colors"
    >
      Retry
    </button>
  );
}
