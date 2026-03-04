import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { decodeCTEntry } from "@/lib/ct/decode-entry";
import { getCachedEntry, setCachedEntry } from "@/lib/ct/entry-cache";
import { getEntries, getSTH } from "@/lib/ct/gorgon";

const KNOWN_LOGS = new Set(["gorgon"]);

const querySchema = z.object({
  start: z.coerce.number().int().min(0),
  count: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ log: string }> }) {
  const { log } = await params;
  if (!KNOWN_LOGS.has(log)) {
    return NextResponse.json({ error: "Unknown CT log" }, { status: 404 });
  }

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

    // Fetch uncached entries from Gorgon, looping since CT logs may return
    // fewer entries than requested per the RFC 6962 spec
    if (uncachedIndices.length > 0) {
      let cursor = uncachedIndices[0];
      const fetchEnd = uncachedIndices[uncachedIndices.length - 1];
      const MAX_ROUNDS = 5;
      for (let round = 0; round < MAX_ROUNDS && cursor <= fetchEnd; round++) {
        const response = await getEntries(cursor, fetchEnd);
        if (response.entries.length === 0) break;

        const decoded = await Promise.all(response.entries.map((raw, i) => decodeCTEntry(raw, cursor + i)));

        for (const entry of decoded) {
          setCachedEntry(entry.index, entry);
        }
        cursor += response.entries.length;
      }
    }

    // Assemble final ordered results from cache
    const entries = [];
    for (let i = start; i <= end; i++) {
      const entry = getCachedEntry(i);
      if (entry) entries.push(entry);
    }

    // Historical pages are immutable (CT logs are append-only); live edge needs fresh data
    const isLiveEdge = end >= treeSize - 1;
    const cacheHeader = isLiveEdge ? "no-store" : CACHE_PRESETS.LONG;

    return NextResponse.json(
      {
        entries,
        range: { start, end, treeSize },
      },
      {
        headers: { "Cache-Control": cacheHeader },
      },
    );
  } catch (error) {
    return apiError(error, "ct.entries.failed", `/api/ct/${log}/entries`, "Failed to fetch CT log entries");
  }
}
