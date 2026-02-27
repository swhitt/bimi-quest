import { ImageResponse } from "next/og";
import { eq, and, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { getOgFonts } from "@/lib/og/fonts";
import { renderLogoToPngDataUri } from "@/lib/og/render-logo";
import { colors, OG_WIDTH, OG_HEIGHT } from "@/lib/og/card-styles";
import { displayIssuerOrg } from "@/lib/ca-display";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hash: string }> },
) {
  const { hash } = await params;

  const [cert] = await db
    .select({
      subjectOrg: certificates.subjectOrg,
      certType: certificates.certType,
      issuerOrg: certificates.issuerOrg,
      sanList: certificates.sanList,
      logotypeSvg: certificates.logotypeSvg,
    })
    .from(certificates)
    .where(
      and(
        eq(certificates.logotypeSvgHash, hash),
        isNotNull(certificates.logotypeSvg),
      ),
    )
    .limit(1);

  if (!cert?.logotypeSvg) {
    return new Response("Not found", { status: 404 });
  }

  const fonts = await getOgFonts();
  const org = cert.subjectOrg || "Unknown";
  const primaryDomain = cert.sanList?.[0] ?? "";
  const certType = cert.certType || "BIMI";
  const issuer = displayIssuerOrg(cert.issuerOrg);

  let logoDataUri: string | null = null;
  try {
    logoDataUri = await renderLogoToPngDataUri(cert.logotypeSvg, 300, 300);
  } catch {
    // SVG rendering failure
  }

  const subtitle = [primaryDomain, certType, issuer].filter(Boolean).join(" · ");

  return new ImageResponse(
    (
      <div
        style={{
          width: OG_WIDTH,
          height: OG_HEIGHT,
          background: `linear-gradient(135deg, ${colors.bg} 0%, #312E81 100%)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Geist",
          gap: 24,
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 300,
            height: 300,
            borderRadius: 24,
            background: colors.cardBg,
            border: `2px solid ${colors.border}`,
          }}
        >
          {logoDataUri ? (
            <img
              src={logoDataUri}
              width={260}
              height={260}
              style={{ objectFit: "contain" }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                color: colors.mono,
                fontSize: 18,
              }}
            >
              No Logo
            </div>
          )}
        </div>

        {/* Org name */}
        <div
          style={{
            fontSize: 40,
            fontWeight: 700,
            color: colors.textPrimary,
            maxWidth: 900,
            textAlign: "center",
            overflow: "hidden",
          }}
        >
          {org.length > 40 ? org.slice(0, 38) + "…" : org}
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 22,
            color: colors.textSecondary,
          }}
        >
          {subtitle}
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
