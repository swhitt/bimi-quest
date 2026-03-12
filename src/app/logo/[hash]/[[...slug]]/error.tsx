"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="container mx-auto px-4 py-16 text-center">
      <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
      <p className="text-muted-foreground mb-4">{error.message || "An unexpected error occurred."}</p>
      <button onClick={reset} className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
        Try again
      </button>
    </div>
  );
}
