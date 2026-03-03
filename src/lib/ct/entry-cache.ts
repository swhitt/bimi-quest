import type { DecodedCTEntry } from "./decode-entry";

const MAX_SIZE = 500;
const cache = new Map<number, DecodedCTEntry>();

export function getCachedEntry(index: number): DecodedCTEntry | undefined {
  const entry = cache.get(index);
  if (entry) {
    // Move to end (most recently used)
    cache.delete(index);
    cache.set(index, entry);
  }
  return entry;
}

export function setCachedEntry(index: number, entry: DecodedCTEntry): void {
  if (cache.has(index)) {
    cache.delete(index);
  } else if (cache.size >= MAX_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(index, entry);
}

export function getCacheStats() {
  return { size: cache.size, maxSize: MAX_SIZE };
}
