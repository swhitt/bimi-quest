import type { Metadata } from "next";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = {
  title: "Offline",
};

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-24 text-center">
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative logo */}
      <svg className="h-20 w-20 text-teal-400 opacity-60" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
        <path
          d="M256 28C186 28 116 56 76 84 72 87 68 92 68 98V258C68 358 140 430 248 482 253 484 259 484 264 482 372 430 444 358 444 258V98C444 92 440 87 436 84 396 56 326 28 256 28Z"
          fill="currentColor"
          opacity="0.3"
        />
        <path
          d="M256 56C196 56 136 80 100 104V258C100 342 160 406 256 454 352 406 412 342 412 258V104C376 80 316 56 256 56Z"
          fill="currentColor"
          opacity="0.15"
        />
        <circle cx="256" cy="256" r="40" fill="currentColor" opacity="0.4" />
      </svg>
      <h1 className="text-2xl font-semibold text-foreground">You&apos;re offline</h1>
      <p className="max-w-sm text-muted-foreground">
        BIMI Quest needs an internet connection to load certificate data. Check your connection and try again.
      </p>
      <RetryButton />
    </div>
  );
}
