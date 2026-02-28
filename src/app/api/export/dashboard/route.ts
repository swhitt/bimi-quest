import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { sql, eq, count, and, gte, lte, desc } from "drizzle-orm";
import { buildPrecertCondition, parseDate } from "@/lib/db/filters";
import { log } from "@/lib/logger";

function buildBaseConditions(params: URLSearchParams) {
  const conditions = [buildPrecertCondition(params.get("precert"))];
  const certType = params.get("type");
  const fromDate = parseDate(params.get("from"));
  const toDate = parseDate(params.get("to"));
  const validity = params.get("validity");
  const root = params.get("root");

  if (certType) conditions.push(eq(certificates.certType, certType));
  if (fromDate) conditions.push(gte(certificates.notBefore, fromDate));
  if (toDate) conditions.push(lte(certificates.notBefore, toDate));
  if (validity === "valid") conditions.push(gte(certificates.notAfter, new Date()));
  if (validity === "expired") conditions.push(lte(certificates.notAfter, new Date()));
  if (root) conditions.push(eq(certificates.rootCaOrg, root));

  return conditions;
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

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
    const baseConditions = buildBaseConditions(params);
    const baseWhere = baseConditions.length > 0 ? and(...baseConditions) : undefined;
    const timestamp = new Date().toISOString().slice(0, 10);

    if (dataset === "market-share") {
      const rows = await db
        .select({
          ca: certificates.rootCaOrg,
          total: count(),
          vmcCount: count(sql`CASE WHEN ${certificates.certType} = 'VMC' THEN 1 END`),
          cmcCount: count(sql`CASE WHEN ${certificates.certType} = 'CMC' THEN 1 END`),
        })
        .from(certificates)
        .where(baseWhere)
        .groupBy(certificates.rootCaOrg)
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

    // dataset === "trends"
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const trendConditions = [...baseConditions, gte(certificates.notBefore, twelveMonthsAgo)];

    const rows = await db
      .select({
        month: sql<string>`to_char(${certificates.notBefore}, 'YYYY-MM')`,
        ca: certificates.rootCaOrg,
        count: count(),
      })
      .from(certificates)
      .where(and(...trendConditions))
      .groupBy(sql`to_char(${certificates.notBefore}, 'YYYY-MM')`, certificates.rootCaOrg)
      .orderBy(sql`to_char(${certificates.notBefore}, 'YYYY-MM')`);

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
