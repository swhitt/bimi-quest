/**
 * Shared DNS refresh orchestrator — used by both the CLI worker (raw SQL)
 * and the cron API endpoint (Drizzle). Callers provide an adapter that
 * handles DB reads/writes, keeping the core logic DB-layer agnostic.
 */
import { lookupDomain, type BimiDnsRow } from "@/workers/modes/backfill-bimi-dns";
import { deriveBimiChangeType, deriveDmarcChangeType, parseTxtRecord, recordsChanged } from "./change-detection";

export interface OldDomainState {
  domain: string;
  bimi_record_raw: string | null;
  dmarc_record_raw: string | null;
}

export interface DnsChangeRecord {
  domain: string;
  recordType: "bimi" | "dmarc";
  changeType: string;
  previousRaw: string | null;
  newRaw: string | null;
  previousRecord: Record<string, string> | null;
  newRecord: Record<string, string> | null;
}

export interface RefreshStats {
  processed: number;
  bimiChanges: number;
  dmarcChanges: number;
  errors: number;
}

/**
 * Adapter interface — callers implement this to provide DB operations.
 * `persistDomain` is a single callback that must atomically insert changes
 * AND upsert state within one transaction.
 */
export interface DnsRefreshAdapter {
  fetchStalest(limit: number): Promise<OldDomainState[]>;
  persistDomain(changes: DnsChangeRecord[], row: BimiDnsRow): Promise<void>;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const BATCH = 10;

export async function refreshDnsBatch(adapter: DnsRefreshAdapter, limit: number): Promise<RefreshStats> {
  console.log(`Refreshing DNS state for up to ${limit} domains...\n`);

  const domains = await adapter.fetchStalest(limit);
  console.log(`Found ${domains.length} domains to refresh.\n`);

  if (domains.length === 0) return { processed: 0, bimiChanges: 0, dmarcChanges: 0, errors: 0 };

  let processed = 0;
  let bimiChanges = 0;
  let dmarcChanges = 0;
  let errors = 0;
  let delayMs = 100;
  const MAX_DELAY = 30_000;

  for (let i = 0; i < domains.length; i += BATCH) {
    const batch = domains.slice(i, i + BATCH);
    let batchErrors = 0;

    const results = await Promise.all(
      batch.map(async (d, idx) => {
        await delay(idx * delayMs);
        try {
          return { old: d, result: await lookupDomain(d.domain) };
        } catch (err) {
          console.error(`  Error looking up ${d.domain}:`, err);
          return { old: d, result: null, error: true as const };
        }
      }),
    );

    for (const entry of results) {
      if (!entry.result) {
        if ("error" in entry) batchErrors++;
        continue;
      }

      const changes = detectChanges(entry.old, entry.result);

      await adapter.persistDomain(changes, entry.result);

      bimiChanges += changes.filter((c) => c.recordType === "bimi").length;
      dmarcChanges += changes.filter((c) => c.recordType === "dmarc").length;
      for (const c of changes) {
        console.log(`  ${c.recordType.toUpperCase()} ${c.changeType}: ${c.domain}`);
      }

      processed++;
      console.log(`  ${processed}/${domains.length}: ${entry.old.domain} [refreshed]`);
    }

    errors += batchErrors;

    if (batchErrors > 0) {
      delayMs = Math.min(delayMs * 2, MAX_DELAY);
      console.log(`  ${batchErrors} errors in batch, backing off to ${delayMs}ms`);
    } else {
      delayMs = 100;
    }
  }

  console.log(
    `\nRefresh complete. ${processed} processed, ${dmarcChanges} DMARC changes, ${bimiChanges} BIMI changes, ${errors} errors.`,
  );
  return { processed, bimiChanges, dmarcChanges, errors };
}

/**
 * Compare old state with freshly-looked-up result and return any change records.
 * Compares parsed JSONB (not raw strings) to avoid false positives from
 * whitespace/ordering/case differences.
 */
function detectChanges(old: OldDomainState, fresh: BimiDnsRow): DnsChangeRecord[] {
  const changes: DnsChangeRecord[] = [];

  // BIMI change detection
  const oldBimi = old.bimi_record_raw ? parseTxtRecord(old.bimi_record_raw) : null;
  const newBimi = fresh.bimi_record_raw ? parseTxtRecord(fresh.bimi_record_raw) : null;

  if (recordsChanged(oldBimi, newBimi)) {
    // Skip first-check (old null, new non-null) — that's initial population, not a "change"
    if (oldBimi !== null || newBimi === null) {
      changes.push({
        domain: fresh.domain,
        recordType: "bimi",
        changeType: deriveBimiChangeType(oldBimi, newBimi),
        previousRaw: old.bimi_record_raw,
        newRaw: fresh.bimi_record_raw,
        previousRecord: oldBimi,
        newRecord: newBimi,
      });
    }
  }

  // DMARC change detection
  const oldDmarc = old.dmarc_record_raw ? parseTxtRecord(old.dmarc_record_raw) : null;
  const newDmarc = fresh.dmarc_record_raw ? parseTxtRecord(fresh.dmarc_record_raw) : null;

  if (recordsChanged(oldDmarc, newDmarc)) {
    if (oldDmarc !== null || newDmarc === null) {
      changes.push({
        domain: fresh.domain,
        recordType: "dmarc",
        changeType: deriveDmarcChangeType(oldDmarc, newDmarc),
        previousRaw: old.dmarc_record_raw,
        newRaw: fresh.dmarc_record_raw,
        previousRecord: oldDmarc,
        newRecord: newDmarc,
      });
    }
  }

  return changes;
}
