import { and, between, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ctLogEntries } from "@/lib/db/schema";
import type { CTLogEntry } from "./gorgon";

interface StoredEntry {
  index: number;
  leafInput: string;
  extraData: string;
}

/** Fetch stored CT log entries for a range of indices. */
export async function getStoredEntries(logName: string, start: number, end: number): Promise<Map<number, CTLogEntry>> {
  const rows = await db
    .select({
      index: ctLogEntries.index,
      leafInput: ctLogEntries.leafInput,
      extraData: ctLogEntries.extraData,
    })
    .from(ctLogEntries)
    .where(and(eq(ctLogEntries.logName, logName), between(ctLogEntries.index, start, end)));

  const map = new Map<number, CTLogEntry>();
  for (const row of rows) {
    map.set(row.index, {
      leaf_input: row.leafInput,
      extra_data: row.extraData,
    });
  }
  return map;
}

/** Persist raw CT log entries. Silently skips entries that already exist. */
export async function storeEntries(logName: string, entries: StoredEntry[]): Promise<void> {
  if (entries.length === 0) return;

  await db
    .insert(ctLogEntries)
    .values(
      entries.map((e) => ({
        index: e.index,
        logName,
        leafInput: e.leafInput,
        extraData: e.extraData,
      })),
    )
    .onConflictDoNothing();
}
