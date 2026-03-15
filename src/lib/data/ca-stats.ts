import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";

export interface CaStats {
  total: number;
  vmcCount: number;
  cmcCount: number;
  activeCount: number;
  intermediates: { name: string; count: number }[];
  topOrgs: { name: string; count: number }[];
}

export async function getCaStats(rootCaOrg: string, intermediateFilter?: string): Promise<CaStats> {
  const baseCondition = intermediateFilter
    ? and(eq(certificates.rootCaOrg, rootCaOrg), eq(certificates.issuerOrg, intermediateFilter))
    : eq(certificates.rootCaOrg, rootCaOrg);

  const [totals] = await db
    .select({
      total: count(),
      vmcCount: count(sql`CASE WHEN ${certificates.certType} = 'VMC' THEN 1 END`),
      cmcCount: count(sql`CASE WHEN ${certificates.certType} = 'CMC' THEN 1 END`),
      activeCount: count(sql`CASE WHEN ${certificates.notAfter} > NOW() THEN 1 END`),
    })
    .from(certificates)
    .where(baseCondition);

  const intermediates = await db
    .select({
      name: certificates.issuerOrg,
      count: count(),
    })
    .from(certificates)
    .where(eq(certificates.rootCaOrg, rootCaOrg))
    .groupBy(certificates.issuerOrg)
    .orderBy(sql`count(*) DESC`)
    .limit(20);

  const topOrgs = await db
    .select({
      name: certificates.subjectOrg,
      count: count(),
    })
    .from(certificates)
    .where(baseCondition)
    .groupBy(certificates.subjectOrg)
    .orderBy(sql`count(*) DESC`)
    .limit(20);

  return {
    total: totals?.total ?? 0,
    vmcCount: totals?.vmcCount ?? 0,
    cmcCount: totals?.cmcCount ?? 0,
    activeCount: totals?.activeCount ?? 0,
    intermediates: intermediates
      .filter((r): r is typeof r & { name: string } => r.name != null)
      .map((r) => ({ name: r.name, count: r.count })),
    topOrgs: topOrgs
      .filter((r): r is typeof r & { name: string } => r.name != null)
      .map((r) => ({ name: r.name, count: r.count })),
  };
}
