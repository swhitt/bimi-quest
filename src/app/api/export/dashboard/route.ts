import { and, count, desc, gte, isNotNull, lte, sql } from "drizzle-orm";
import { type NextRequest } from "next/server";
import { apiError } from "@/lib/api-utils";
import { escapeCSV } from "@/lib/csv";
import { db } from "@/lib/db";
import { buildCertificateConditions } from "@/lib/db/certificate-filters";
import { buildStatsConditions } from "@/lib/db/filters";
import { certificates } from "@/lib/db/schema";

const VALID_DATASETS = new Set(["market-share", "trends", "industries", "cert-types", "expiry"]);

function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const dataset = params.get("dataset");

  if (!dataset || !VALID_DATASETS.has(dataset)) {
    return new Response(JSON.stringify({ error: `Invalid dataset. Use one of: ${[...VALID_DATASETS].join(", ")}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
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
        return [escapeCSV(r.ca || "Unknown"), r.total, r.vmcCount, r.cmcCount, share].join(",");
      });

      return csvResponse([header, ...csvRows].join("\n"), `bimi-market-share-${timestamp}.csv`);
    }

    if (dataset === "trends") {
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

      const firstMonth = allRows.length > 0 ? allRows[0].month : null;
      const rows = firstMonth ? allRows.filter((r) => r.month !== firstMonth) : allRows;

      const header = "Month,CA,Count";
      const csvRows = rows.map((r) => [escapeCSV(r.month), escapeCSV(r.ca || "Unknown"), r.count].join(","));

      return csvResponse([header, ...csvRows].join("\n"), `bimi-trends-${timestamp}.csv`);
    }

    if (dataset === "industries") {
      const statsWhere = and(buildStatsConditions(params), isNotNull(certificates.industry));
      const rows = await db
        .select({
          industry: certificates.industry,
          total: count(),
          vmcCount: count(sql`CASE WHEN ${certificates.certType} = 'VMC' THEN 1 END`),
          cmcCount: count(sql`CASE WHEN ${certificates.certType} = 'CMC' THEN 1 END`),
        })
        .from(certificates)
        .where(statsWhere)
        .groupBy(certificates.industry)
        .orderBy(desc(count()));

      const header = "Industry,Total,VMC,CMC";
      const csvRows = rows.map((r) => [escapeCSV(r.industry || "Unknown"), r.total, r.vmcCount, r.cmcCount].join(","));

      return csvResponse([header, ...csvRows].join("\n"), `bimi-industries-${timestamp}.csv`);
    }

    if (dataset === "cert-types") {
      const rows = await db
        .select({
          certType: certificates.certType,
          markType: certificates.markType,
          total: count(),
        })
        .from(certificates)
        .where(baseWhere)
        .groupBy(certificates.certType, certificates.markType)
        .orderBy(desc(count()));

      const header = "Cert Type,Mark Type,Count";
      const csvRows = rows.map((r) =>
        [escapeCSV(r.certType || "Unknown"), escapeCSV(r.markType || "Unknown"), r.total].join(","),
      );

      return csvResponse([header, ...csvRows].join("\n"), `bimi-cert-types-${timestamp}.csv`);
    }

    if (dataset === "expiry") {
      const now = new Date();
      const twelveMonthsFromNow = new Date(now);
      twelveMonthsFromNow.setMonth(twelveMonthsFromNow.getMonth() + 12);

      const statsWhere = and(
        buildStatsConditions(params),
        gte(certificates.notAfter, now),
        lte(certificates.notAfter, twelveMonthsFromNow),
      );

      const rows = await db
        .select({
          month: sql<string>`to_char(${certificates.notAfter}, 'YYYY-MM')`,
          ca: certificates.issuerOrg,
          total: count(),
        })
        .from(certificates)
        .where(statsWhere)
        .groupBy(sql`to_char(${certificates.notAfter}, 'YYYY-MM')`, certificates.issuerOrg)
        .orderBy(sql`to_char(${certificates.notAfter}, 'YYYY-MM')`, desc(count()));

      const header = "Expiry Month,CA,Count";
      const csvRows = rows.map((r) => [escapeCSV(r.month), escapeCSV(r.ca || "Unknown"), r.total].join(","));

      return csvResponse([header, ...csvRows].join("\n"), `bimi-expiry-${timestamp}.csv`);
    }
  } catch (error) {
    return apiError(error, "export.dashboard.failed", "/api/export/dashboard", "Failed to export dashboard data");
  }
}
