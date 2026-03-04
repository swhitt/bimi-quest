import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { decodeCTEntry } from "@/lib/ct/decode-entry";
import { getCachedEntry, setCachedEntry } from "@/lib/ct/entry-cache";
import { getStoredEntries, storeEntries } from "@/lib/ct/entry-store";
import { getEntries, getSTH } from "@/lib/ct/gorgon";
import type { CTLogEntry } from "@/lib/ct/gorgon";

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

    const end = Math.min(start + count - 1, treeSize - 1);

    // L1: collect entries from in-memory LRU cache
    const rawEntries = new Map<number, CTLogEntry>();
    const l1Misses: number[] = [];
    for (let i = start; i <= end; i++) {
      if (!getCachedEntry(i)) l1Misses.push(i);
    }

    // L2: fetch from DB for anything not in memory
    if (l1Misses.length > 0) {
      const dbEntries = await getStoredEntries(log, l1Misses[0], l1Misses[l1Misses.length - 1]);
      for (const [idx, entry] of dbEntries) {
        rawEntries.set(idx, entry);
      }
    }

    // Identify indices still missing after L1 + L2
    const dbMisses: number[] = [];
    for (const idx of l1Misses) {
      if (!rawEntries.has(idx)) dbMisses.push(idx);
    }

    // L3: fetch from Gorgon for truly new entries
    if (dbMisses.length > 0) {
      let cursor = dbMisses[0];
      const fetchEnd = dbMisses[dbMisses.length - 1];
      const MAX_ROUNDS = 5;
      const toStore: Array<{ index: number; leafInput: string; extraData: string }> = [];

      for (let round = 0; round < MAX_ROUNDS && cursor <= fetchEnd; round++) {
        const response = await getEntries(cursor, fetchEnd);
        if (response.entries.length === 0) break;

        for (let i = 0; i < response.entries.length; i++) {
          const raw = response.entries[i];
          const idx = cursor + i;
          rawEntries.set(idx, raw);
          toStore.push({ index: idx, leafInput: raw.leaf_input, extraData: raw.extra_data });
        }
        cursor += response.entries.length;
      }

      // Persist new entries to DB (fire-and-forget is fine, but await to be safe)
      await storeEntries(log, toStore);
    }

    // Decode all entries, populating L1 cache
    const entries = [];
    for (let i = start; i <= end; i++) {
      const cached = getCachedEntry(i);
      if (cached) {
        entries.push(cached);
        continue;
      }
      const raw = rawEntries.get(i);
      if (raw) {
        const decoded = await decodeCTEntry(raw, i);
        setCachedEntry(i, decoded);
        entries.push(decoded);
      }
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
