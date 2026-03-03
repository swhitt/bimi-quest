import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { decodeCTEntry } from "@/lib/ct/decode-entry";
import { getCachedEntry, setCachedEntry } from "@/lib/ct/entry-cache";
import { getEntries, getSTH } from "@/lib/ct/gorgon";

const querySchema = z.object({
  start: z.coerce.number().int().min(0),
  count: z.coerce.number().int().min(1).max(50).default(25),
});

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const parsed = querySchema.safeParse({
    start: searchParams.get("start"),
    count: searchParams.get("count") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters", details: parsed.error.issues }, { status: 400 });
  }

  const { start, count } = parsed.data;

  try {
    const sth = await getSTH();
    const treeSize = sth.tree_size;

    if (start >= treeSize) {
      return NextResponse.json({ error: `start (${start}) is beyond tree size (${treeSize})` }, { status: 400 });
    }

    // Clamp end to the last valid index
    const end = Math.min(start + count - 1, treeSize - 1);

    // Collect uncached indices
    const uncachedIndices: number[] = [];
    for (let i = start; i <= end; i++) {
      if (!getCachedEntry(i)) uncachedIndices.push(i);
    }

    // Fetch uncached entries from Gorgon in a single batch
    if (uncachedIndices.length > 0) {
      const fetchStart = uncachedIndices[0];
      const fetchEnd = uncachedIndices[uncachedIndices.length - 1];
      const response = await getEntries(fetchStart, fetchEnd);

      const decodePromises = response.entries.map((raw, i) => decodeCTEntry(raw, fetchStart + i));
      const decoded = await Promise.all(decodePromises);

      for (const entry of decoded) {
        setCachedEntry(entry.index, entry);
      }
    }

    // Assemble final ordered results from cache
    const entries = [];
    for (let i = start; i <= end; i++) {
      const entry = getCachedEntry(i);
      if (entry) entries.push(entry);
    }

    return NextResponse.json(
      {
        entries,
        range: { start, end, treeSize },
      },
      {
        headers: { "Cache-Control": CACHE_PRESETS.IMMUTABLE },
      },
    );
  } catch (error) {
    return apiError(error, "ct-log.entries.failed", "/api/ct-log/entries", "Failed to fetch CT log entries");
  }
}
