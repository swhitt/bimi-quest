import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { buildPrecertCondition } from "@/lib/db/filters";
import { log } from "@/lib/logger";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://bimi.quest";

export async function GET() {
  try {
    const recent = await db
      .select({
        id: certificates.id,
        fingerprintSha256: certificates.fingerprintSha256,
        subjectOrg: certificates.subjectOrg,
        subjectCn: certificates.subjectCn,
        sanList: certificates.sanList,
        issuerOrg: certificates.issuerOrg,
        certType: certificates.certType,
        notBefore: certificates.notBefore,
        subjectCountry: certificates.subjectCountry,
      })
      .from(certificates)
      .where(buildPrecertCondition(null))
      .orderBy(desc(certificates.notBefore))
      .limit(50);

    const items = recent.map((cert) => {
      const title = `${cert.certType || "BIMI"}: ${cert.subjectOrg || cert.subjectCn || cert.sanList[0] || "Unknown"}`;
      const domain = cert.sanList[0] || cert.subjectCn || "";
      const link = `${BASE_URL}/certificates/${cert.fingerprintSha256.slice(0, 12)}`;
      const pubDate = cert.notBefore.toUTCString();
      const description = `${cert.certType || "BIMI"} certificate issued by ${cert.issuerOrg || "Unknown CA"} for ${domain}${cert.subjectCountry ? ` (${cert.subjectCountry})` : ""}`;

      return `    <item>
      <title><![CDATA[${title}]]></title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${description}]]></description>
    </item>`;
    }).join("\n");

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>BIMI Quest - Recent Certificate Issuances</title>
    <link>${BASE_URL}</link>
    <description>Latest BIMI VMC and CMC certificate issuances from Certificate Transparency logs.</description>
    <language>en</language>
    <atom:link href="${BASE_URL}/api/feed" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

    return new NextResponse(rss, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    log('error', 'feed.api.failed', { error: String(error), route: '/api/feed' });
    const emptyRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>BIMI Quest - Recent Certificate Issuances</title>
    <link>${BASE_URL}</link>
    <description>Latest BIMI VMC and CMC certificate issuances from Certificate Transparency logs.</description>
    <language>en</language>
    <atom:link href="${BASE_URL}/api/feed" rel="self" type="application/rss+xml"/>
  </channel>
</rss>`;
    return new NextResponse(emptyRss, {
      status: 500,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }
}
