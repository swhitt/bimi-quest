import type { NeonQueryFunction } from "@neondatabase/serverless";
import { parseCertBasicInfo } from "@/lib/ct/parser";
import { safeFetch } from "@/lib/net/safe-fetch";
import { throttle } from "@/lib/ct/gorgon";

interface DomainRow {
  domain: string;
  bimi_authority_url: string;
  dns_snapshot: Record<string, unknown> | null;
}

const BATCH = 10;

export async function backfillCerts(sql: NeonQueryFunction<false, false>, limit: number) {
  console.log(`Backfilling certificates for up to ${limit} domains...\n`);

  const domains = (await sql`
		SELECT domain, bimi_authority_url, dns_snapshot
		FROM domain_bimi_state
		WHERE bimi_authority_url IS NOT NULL
		  AND (
		    dns_snapshot IS NULL
		    OR dns_snapshot->'certificate' IS NULL
		    OR dns_snapshot->'certificate' = 'null'::jsonb
		    OR dns_snapshot->'certificate'->>'found' != 'true'
		  )
		ORDER BY last_checked ASC NULLS FIRST
		LIMIT ${limit}
	`) as DomainRow[];

  console.log(`Found ${domains.length} domains needing cert fetch.\n`);
  if (domains.length === 0) return;

  let processed = 0;
  let fetched = 0;
  let failed = 0;

  for (let i = 0; i < domains.length; i += BATCH) {
    const batch = domains.slice(i, i + BATCH);

    const results = await Promise.all(
      batch.map(async (d) => {
        try {
          const res = await safeFetch(d.bimi_authority_url, {
            headers: { "User-Agent": "bimi-quest/1.0 (BIMI Validator)" },
            signal: AbortSignal.timeout(15_000),
          });
          if (!res.ok) return { domain: d, cert: null, error: `HTTP ${res.status}` };

          const pemText = await res.text();
          const certInfo = parseCertBasicInfo(pemText);
          if (!certInfo) return { domain: d, cert: null, error: "PEM parse failed" };

          return {
            domain: d,
            cert: {
              found: true,
              authorityUrl: d.bimi_authority_url,
              certType: certInfo.certType,
              issuer: certInfo.issuer,
              serialNumber: certInfo.serialNumber,
              subject: certInfo.subject,
              notBefore: certInfo.notBefore.toISOString(),
              notAfter: certInfo.notAfter.toISOString(),
              subjectAltNames: certInfo.sans.length > 0 ? certInfo.sans : null,
              markType: certInfo.markType,
              logoHashAlgorithm: certInfo.logotypeSvgHash ? "SHA-256" : null,
              logoHashValue: certInfo.logotypeSvgHash,
            },
            error: null,
          };
        } catch (err) {
          return { domain: d, cert: null, error: String(err) };
        }
      }),
    );

    for (const r of results) {
      processed++;
      if (r.cert) {
        const snapshot = r.domain.dns_snapshot ?? {};
        snapshot.certificate = r.cert;

        await sql`
					UPDATE domain_bimi_state
					SET dns_snapshot = ${JSON.stringify(snapshot)}::jsonb,
					    updated_at = now()
					WHERE domain = ${r.domain.domain}
				`;
        fetched++;
        console.log(`  ${processed}/${domains.length}: ${r.domain.domain} [${r.cert.certType} from ${r.cert.issuer}]`);
      } else {
        failed++;
        console.log(`  ${processed}/${domains.length}: ${r.domain.domain} [FAILED: ${r.error}]`);
      }
    }

    await throttle(50);
  }

  console.log(`\nBackfill complete. ${processed} processed, ${fetched} certs fetched, ${failed} failed.`);
}
