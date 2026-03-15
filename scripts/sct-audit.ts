import { neon } from "@neondatabase/serverless";
import { parseSCTList } from "@/lib/ct/sct-parser";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  const rows = await sql`
    SELECT id, issuer_org,
      CASE jsonb_typeof(extensions_json->'1.3.6.1.4.1.11129.2.4.2')
        WHEN 'object' THEN extensions_json->'1.3.6.1.4.1.11129.2.4.2'->>'v'
        WHEN 'string' THEN extensions_json->>'1.3.6.1.4.1.11129.2.4.2'
        ELSE NULL
      END AS sct_hex
    FROM certificates
    WHERE is_precert = false AND is_superseded = false
      AND extensions_json ? '1.3.6.1.4.1.11129.2.4.2'
  `;

  const logCounts = new Map<string, number>();
  const logByIssuer = new Map<string, Map<string, number>>();
  const sctCountDist = new Map<number, number>();
  let totalCerts = 0;
  let parseFails = 0;

  for (const row of rows) {
    totalCerts++;
    const hex = row.sct_hex as string | null;
    if (!hex) {
      parseFails++;
      continue;
    }
    try {
      const scts = parseSCTList(hex);
      sctCountDist.set(scts.length, (sctCountDist.get(scts.length) ?? 0) + 1);
      for (const sct of scts) {
        logCounts.set(sct.logId, (logCounts.get(sct.logId) ?? 0) + 1);

        const issuer = (row.issuer_org as string) ?? "Unknown";
        if (!logByIssuer.has(sct.logId)) logByIssuer.set(sct.logId, new Map());
        const issuerMap = logByIssuer.get(sct.logId)!;
        issuerMap.set(issuer, (issuerMap.get(issuer) ?? 0) + 1);
      }
    } catch {
      parseFails++;
    }
  }

  console.log(`Parsed ${totalCerts} final certs, ${parseFails} parse failures\n`);

  console.log("SCTs per cert distribution:");
  for (const [count, certs] of [...sctCountDist.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${count} SCTs: ${certs} certs`);
  }

  console.log(`\nLog ID (base64)${" ".repeat(33)} |  Count | Issuers`);
  console.log("-".repeat(130));

  const sorted = [...logCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [logId, count] of sorted) {
    const issuers = logByIssuer.get(logId)!;
    const issuerStr = [...issuers.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => `${name}(${n})`)
      .join(", ");
    console.log(`${logId.padEnd(48)} | ${String(count).padStart(6)} | ${issuerStr}`);
  }
}

main();
