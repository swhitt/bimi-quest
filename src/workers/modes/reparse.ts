import type { NeonQueryFunction } from "@neondatabase/serverless";
import { X509Certificate } from "@peculiar/x509";
import { extractBIMIData, pemToDer } from "@/lib/ct/parser";
import { toArrayBuffer } from "@/lib/pem";
import { upsertLogoSql } from "@/lib/db/logo-ops";

/**
 * Re-extract SVG hashes and mark types from stored PEMs for certs missing them.
 * Now writes logo data to the logos table instead of certificates.logotype_svg.
 */
export async function reparse(sql: NeonQueryFunction<false, false>) {
  console.log("Re-parsing stored certificates for SVG hash and mark type...\n");

  const BATCH = 100;
  let lastId = 0;
  let scanned = 0;
  let updated = 0;

  while (true) {
    const rows = (await sql`
      SELECT id, raw_pem, logotype_svg_hash, mark_type
      FROM certificates
      WHERE id > ${lastId}
      ORDER BY id
      LIMIT ${BATCH}
    `) as { id: number; raw_pem: string; logotype_svg_hash: string | null; mark_type: string | null }[];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (row.logotype_svg_hash && row.mark_type) continue;

      try {
        const der = pemToDer(row.raw_pem);
        const cert = new X509Certificate(toArrayBuffer(der));

        const bimiData = await extractBIMIData(cert, der);
        const updates: Record<string, string | null> = {};

        if (!row.logotype_svg_hash && bimiData.logotypeSvgHash) {
          updates.logotype_svg_hash = bimiData.logotypeSvgHash;

          // Also upsert the logo content to the logos table
          if (bimiData.logotypeSvg) {
            await upsertLogoSql(sql, {
              svgHash: bimiData.logotypeSvgHash,
              svgContent: bimiData.logotypeSvg,
              source: "cert",
              seenAt: new Date(),
            });
          }
        }
        if (!row.mark_type && bimiData.markType) {
          updates.mark_type = bimiData.markType;
          updates.cert_type = bimiData.certType;
        }

        if (Object.keys(updates).length > 0) {
          await sql`
            UPDATE certificates SET
              logotype_svg_hash = COALESCE(${updates.logotype_svg_hash ?? null}, logotype_svg_hash),
              mark_type = COALESCE(${updates.mark_type ?? null}, mark_type),
              cert_type = COALESCE(${updates.cert_type ?? null}, cert_type)
            WHERE id = ${row.id}
          `;
          updated++;
          if (updated % 100 === 0) {
            process.stdout.write(`\r  Updated ${updated} certs...`);
          }
        }
      } catch (err) {
        console.error(`\n  Error re-parsing cert ${row.id}:`, err);
      }
    }

    lastId = rows[rows.length - 1].id;
    scanned += rows.length;
    process.stdout.write(`\r  Scanned ${scanned} certs, updated ${updated}...`);
  }

  console.log(`\n\nRe-parse complete. Updated ${updated} certificates.`);
}
