import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { sql, count, and, desc, gte } from "drizzle-orm";
import { buildCertificateConditions } from "@/lib/db/certificate-filters";
import { log } from "@/lib/logger";
import { escapeCSV } from "@/lib/csv";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const dataset = params.get("dataset");

  if (dataset !== "market-share" && dataset !== "trends") {
    return new Response(
      JSON.stringify({ error: 'Invalid dataset. Use "market-share" or "trends".' }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const baseWhere = buildCertificateConditions(params);
    const timestamp = new Date().toISOString().slice(0, 10);

    if (dataset === "market-share") {
      const rows = await db
        .select({
          ca: certificates.issuerOrg,
          total: count(),
          vmcCount: count(sql`CASE WHEN ${certificates.certType} = 'VMC' THEN 1 END`),
          cmcCount: count(sql`CASE WHEN ${certificates.certType} = 'CMC' THEN 1 END`),
        })
        .from(certificates)
        .where(baseWhere)
        .groupBy(certificates.issuerOrg)
        .orderBy(desc(count()));

      const grandTotal = rows.reduce((s, r) => s + r.total, 0);

      const header = "CA,Total Certificates,VMC Count,CMC Count,Market Share %";
      const csvRows = rows.map((r) => {
        const share = grandTotal > 0 ? ((r.total / grandTotal) * 100).toFixed(2) : "0.00";
        return [
          escapeCSV(r.ca || "Unknown"),
          r.total,
          r.vmcCount,
          r.cmcCount,
          share,
        ].join(",");
      });

      const csv = [header, ...csvRows].join("\n");
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="bimi-market-share-${timestamp}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // dataset === "trends" - fetch 13 months, drop the partial first month
    const thirteenMonthsAgo = new Date();
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);

    const allRows = await db
      .select({
        month: sql<string>`to_char(${certificates.notBefore}, 'YYYY-MM')`,
        ca: certificates.issuerOrg,
        count: count(),
      })
      .from(certificates)
      .where(and(baseWhere, gte(certificates.notBefore, thirteenMonthsAgo)))
      .groupBy(sql`to_char(${certificates.notBefore}, 'YYYY-MM')`, certificates.issuerOrg)
      .orderBy(sql`to_char(${certificates.notBefore}, 'YYYY-MM')`);

    // Drop the partial first month
    const firstMonth = allRows.length > 0 ? allRows[0].month : null;
    const rows = firstMonth ? allRows.filter((r) => r.month !== firstMonth) : allRows;

    const header = "Month,CA,Count";
    const csvRows = rows.map((r) =>
      [escapeCSV(r.month), escapeCSV(r.ca || "Unknown"), r.count].join(",")
    );

    const csv = [header, ...csvRows].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bimi-trends-${timestamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    log("error", "export.dashboard.failed", { error: String(error), dataset });
    return new Response(
      JSON.stringify({ error: "Failed to export dashboard data" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
