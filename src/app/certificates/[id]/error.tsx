"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3">
      <p className="text-destructive text-sm">Error loading certificate.</p>
      <button className="text-sm underline" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
