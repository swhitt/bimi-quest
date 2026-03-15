import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const [logDistribution, sctCountDistribution, avgLagByCA, singleLogResult] = await Promise.all([
      // Which CT logs appear most often
      db.execute(sql`
        SELECT log_name, log_operator, count(*)::int AS cert_count
        FROM certificate_scts
        GROUP BY log_name, log_operator
        ORDER BY cert_count DESC
      `),

      // How many SCTs per certificate (histogram)
      db.execute(sql`
        SELECT sct_count, count(*)::int AS cert_count
        FROM certificates
        WHERE sct_count IS NOT NULL
        GROUP BY sct_count
        ORDER BY sct_count
      `),

      // Average issuance-to-SCT lag by root CA
      db.execute(sql`
        SELECT c.root_ca_org AS ca,
               round(avg(s.lag_seconds))::text AS avg_lag,
               count(DISTINCT c.id)::int AS cert_count
        FROM certificate_scts s
        JOIN certificates c ON c.id = s.certificate_id
        WHERE s.lag_seconds IS NOT NULL
        GROUP BY c.root_ca_org
        ORDER BY cert_count DESC
        LIMIT 15
      `),

      // Certs with only a single SCT
      db.execute(sql`
        SELECT count(*)::int AS cnt
        FROM certificates
        WHERE sct_count = 1
      `),
    ]);

    return NextResponse.json(
      {
        logDistribution: logDistribution.rows.map((r) => ({
          logName: r.log_name,
          logOperator: r.log_operator,
          certCount: r.cert_count,
        })),
        sctCountDistribution: sctCountDistribution.rows.map((r) => ({
          sctCount: r.sct_count,
          certCount: r.cert_count,
        })),
        avgLagByCA: avgLagByCA.rows.map((r) => ({
          ca: r.ca,
          avgLag: r.avg_lag,
          certCount: r.cert_count,
        })),
        singleLogCerts: (singleLogResult.rows[0]?.cnt as number) ?? 0,
      },
      { headers: { "Cache-Control": CACHE_PRESETS.MEDIUM_LONG } },
    );
  } catch (error) {
    return apiError(error, "sct-stats.api.failed", "/api/stats/sct", "Failed to fetch SCT stats");
  }
}
