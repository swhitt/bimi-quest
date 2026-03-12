import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { BimiDnsRow } from "./backfill-bimi-dns";
import type { DnsChangeRecord, DnsRefreshAdapter, OldDomainState } from "@/lib/dns/refresh-orchestrator";
import { refreshDnsBatch } from "@/lib/dns/refresh-orchestrator";
import { upsertDomainStateSql } from "@/lib/dns/persist-domain-state";

/**
 * CLI worker adapter — uses raw neon() SQL template tag with
 * transaction support for atomic change-insert + state-upsert.
 */
function createRawSqlAdapter(sql: NeonQueryFunction<false, false>): DnsRefreshAdapter {
  return {
    async fetchStalest(limit: number): Promise<OldDomainState[]> {
      return (await sql`
				SELECT domain, bimi_record_raw, dmarc_record_raw
				FROM domain_bimi_state
				ORDER BY last_checked ASC NULLS FIRST, created_at ASC
				LIMIT ${limit}
			`) as OldDomainState[];
    },

    async persistDomain(changes: DnsChangeRecord[], row: BimiDnsRow): Promise<void> {
      await sql.transaction([
        ...changes.map(
          (c) => sql`
						INSERT INTO dns_record_changes (domain, record_type, change_type, previous_raw, new_raw, previous_record, new_record)
						VALUES (
							${c.domain}, ${c.recordType}, ${c.changeType},
							${c.previousRaw}, ${c.newRaw},
							${c.previousRecord ? JSON.stringify(c.previousRecord) : null}::jsonb,
							${c.newRecord ? JSON.stringify(c.newRecord) : null}::jsonb
						)
					`,
        ),
        upsertDomainStateSql(sql, row),
      ]);
    },
  };
}

export async function refreshDns(sql: NeonQueryFunction<false, false>, limit: number) {
  const adapter = createRawSqlAdapter(sql);
  return refreshDnsBatch(adapter, limit);
}
