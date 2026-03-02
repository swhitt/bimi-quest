import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

export const revalidate = 3600;

import { desc } from "drizzle-orm";
import { certificates } from "@/lib/db/schema";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://bimi.quest";

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "hourly", priority: 1.0 },
    { url: `${baseUrl}/certificates`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${baseUrl}/validate`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/map`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
    { url: `${baseUrl}/logos`, lastModified: new Date(), changeFrequency: "daily", priority: 0.6 },
  ];

  try {
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

    return [...staticRoutes, ...certRoutes];
  } catch {
    return staticRoutes;
  }
}
