import { sql, count, countDistinct } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { displayIssuerOrg } from "@/lib/ca-display";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { colors, OG_HEIGHT, OG_WIDTH } from "@/lib/og/card-styles";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";

export async function GET() {
  const [stats] = await db
    .select({
      totalCerts: count(),
      activeCerts: count(sql`CASE WHEN ${certificates.notAfter} > NOW() THEN 1 END`),
      uniqueOrgs: countDistinct(certificates.subjectOrg),
      newLast30d: count(sql`CASE WHEN ${certificates.notBefore} > NOW() - INTERVAL '30 days' THEN 1 END`),
    })
    .from(certificates);

  const topCAs = await db
    .select({
      ca: certificates.issuerOrg,
      certCount: count(),
    })
    .from(certificates)
    .groupBy(certificates.issuerOrg)
    .orderBy(sql`count(*) DESC`)
    .limit(3);

  const fonts = await getOgFonts();
  const maxCount = topCAs[0]?.certCount ?? 1;

  const statBoxes = [
    { value: stats.totalCerts, label: "Total Certs" },
    { value: stats.activeCerts, label: "Active" },
    { value: stats.uniqueOrgs, label: "Unique Orgs" },
    { value: stats.newLast30d, label: "New (30d)" },
  ];

  return new ImageResponse(
    <div
      style={{
        width: OG_WIDTH,
        height: OG_HEIGHT,
        background: `linear-gradient(145deg, ${colors.bg} 0%, #0F1A2E 100%)`,
        display: "flex",
        flexDirection: "column",
        fontFamily: "IBM Plex Sans",
        padding: "48px 56px",
      }}
    >
      {/* Top section */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 48, fontWeight: 700, color: colors.textPrimary }}>BIMI Quest</div>
        <div style={{ fontSize: 24, color: colors.textSecondary }}>Certificate Market Intelligence</div>
      </div>

      {/* Stat boxes */}
      <div style={{ display: "flex", gap: 24, marginTop: 36 }}>
        {statBoxes.map((s) => (
          <div
            key={s.label}
            style={{
              display: "flex",
              flexDirection: "column",
              background: colors.cardBg,
              border: `1px solid ${colors.border}`,
              borderRadius: 16,
              padding: "20px 28px",
              flex: 1,
            }}
          >
            <div style={{ fontSize: 40, fontWeight: 700, color: colors.textPrimary }}>{s.value.toLocaleString()}</div>
            <div style={{ fontSize: 14, color: colors.mono }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Top CAs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 36 }}>
        {topCAs.map((ca) => (
          <div key={ca.ca} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontSize: 18, color: colors.textPrimary }}>{displayIssuerOrg(ca.ca)}</div>
              <div style={{ fontSize: 18, color: colors.textSecondary }}>{ca.certCount.toLocaleString()}</div>
            </div>
            <div
              style={{
                height: 8,
                borderRadius: 4,
                background: colors.textSecondary,
                width: `${Math.round((ca.certCount / maxCount) * 100)}%`,
              }}
            />
          </div>
        ))}
      </div>

      {/* Watermark */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: 56,
          fontSize: 18,
          color: colors.watermark,
          fontWeight: 700,
        }}
      >
        bimi.quest
      </div>
    </div>,
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts,
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      },
    },
  );
}
