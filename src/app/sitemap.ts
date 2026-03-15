import type { MetadataRoute } from "next";
import { desc, isNotNull, sql } from "drizzle-orm";
import { ALL_CA_SLUGS } from "@/lib/ca-slugs";
import { db } from "@/lib/db";
import { certificates, domainBimiState, logos } from "@/lib/db/schema";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://bimi.quest";

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "hourly", priority: 1.0 },
    { url: `${baseUrl}/certificates`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${baseUrl}/check`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/domains`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
    { url: `${baseUrl}/organizations`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
    { url: `${baseUrl}/logos`, lastModified: new Date(), changeFrequency: "daily", priority: 0.6 },
    { url: `${baseUrl}/map`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
    { url: `${baseUrl}/transparency`, lastModified: new Date(), changeFrequency: "daily", priority: 0.5 },
    { url: `${baseUrl}/dns-changes`, lastModified: new Date(), changeFrequency: "daily", priority: 0.5 },
    { url: `${baseUrl}/tools/lint`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/tools/asn1`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
  ];

  // CA pages from known slugs
  const caRoutes: MetadataRoute.Sitemap = ALL_CA_SLUGS.map((slug) => ({
    url: `${baseUrl}/cas/${slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  try {
    // Recent certificates (top 1000)
    const recentCerts = await db
      .select({
        fingerprintSha256: certificates.fingerprintSha256,
        notBefore: certificates.notBefore,
      })
      .from(certificates)
      .orderBy(desc(certificates.notBefore))
      .limit(1000);

    const certRoutes: MetadataRoute.Sitemap = recentCerts.map((cert) => ({
      url: `${baseUrl}/certificates/${cert.fingerprintSha256}`,
      lastModified: cert.notBefore ? new Date(cert.notBefore) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }));

    // Org pages (top 500 distinct orgs by slug)
    const orgs = await db
      .select({ slug: certificates.subjectOrgSlug })
      .from(certificates)
      .where(isNotNull(certificates.subjectOrgSlug))
      .groupBy(certificates.subjectOrgSlug)
      .orderBy(sql`count(*) desc`)
      .limit(500);

    const orgRoutes: MetadataRoute.Sitemap = orgs
      .filter((r) => r.slug)
      .map((r) => ({
        url: `${baseUrl}/orgs/${r.slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.5,
      }));

    // Domain pages (top 2000 domains with BIMI records)
    const domains = await db
      .select({ domain: domainBimiState.domain })
      .from(domainBimiState)
      .where(isNotNull(domainBimiState.bimiRecordRaw))
      .orderBy(desc(domainBimiState.lastChecked))
      .limit(2000);

    const domainRoutes: MetadataRoute.Sitemap = domains.map((r) => ({
      url: `${baseUrl}/domains/${r.domain}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }));

    // Logo pages (top 1000 from logos table)
    const logoRows = await db.select({ hash: logos.svgHash }).from(logos).orderBy(desc(logos.lastSeenAt)).limit(1000);

    const logoRoutes: MetadataRoute.Sitemap = logoRows
      .filter((r) => r.hash)
      .map((r) => ({
        url: `${baseUrl}/logos/${r.hash}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.4,
      }));

    return [...staticRoutes, ...caRoutes, ...certRoutes, ...orgRoutes, ...domainRoutes, ...logoRoutes];
  } catch {
    return [...staticRoutes, ...caRoutes];
  }
}
