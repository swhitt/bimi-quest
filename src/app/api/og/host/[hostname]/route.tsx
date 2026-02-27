import { ImageResponse } from "next/og";
import { sql, and, isNotNull, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { getOgFonts } from "@/lib/og/fonts";
import { renderLogoToPngDataUri } from "@/lib/og/render-logo";
import { colors, OG_WIDTH, OG_HEIGHT } from "@/lib/og/card-styles";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hostname: string }> },
) {
  const { hostname } = await params;
  const decoded = decodeURIComponent(hostname).toLowerCase();

  // Get cert count and first logo for this host
  const rows = await db
    .select({
      subjectOrg: certificates.subjectOrg,
      logotypeSvg: certificates.logotypeSvg,
      certType: certificates.certType,
    })
    .from(certificates)
    .where(
      and(
        sql`${decoded} = ANY(${certificates.sanList})`,
        isNotNull(certificates.fingerprintSha256),
      ),
    )
    .orderBy(desc(certificates.notBefore))
    .limit(20);

  const fonts = await getOgFonts();
  const certCount = rows.length;
  const firstWithLogo = rows.find((r) => r.logotypeSvg);
  const org = rows[0]?.subjectOrg || decoded;

  let logoDataUri: string | null = null;
  if (firstWithLogo?.logotypeSvg) {
    try {
      logoDataUri = await renderLogoToPngDataUri(firstWithLogo.logotypeSvg, 200, 200);
    } catch {
      // SVG rendering failure
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: OG_WIDTH,
          height: OG_HEIGHT,
          background: `linear-gradient(145deg, ${colors.bg} 0%, #0F1A2E 100%)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "IBM Plex Sans",
          gap: 24,
        }}
      >
        {/* Logo if available */}
        {logoDataUri && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 180,
              height: 180,
              borderRadius: 20,
              background: colors.cardBg,
              border: `2px solid ${colors.border}`,
            }}
          >
            <img
              src={logoDataUri}
              width={140}
              height={140}
              style={{ objectFit: "contain" }}
            />
          </div>
        )}

        {/* Hostname */}
        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: colors.textPrimary,
          }}
        >
          {decoded.length > 35 ? decoded.slice(0, 33) + "…" : decoded}
        </div>

        {/* Cert count badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              display: "flex",
              background: colors.badgeBg,
              color: colors.badgeText,
              padding: "8px 20px",
              borderRadius: 10,
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            {`${certCount === 20 ? "20+" : certCount} BIMI certificate${certCount !== 1 ? "s" : ""}`}
          </div>
        </div>

        {/* Org name */}
        {org !== decoded && (
          <div style={{ fontSize: 24, color: colors.textSecondary }}>
            {org}
          </div>
        )}

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
      </div>
    ),
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
