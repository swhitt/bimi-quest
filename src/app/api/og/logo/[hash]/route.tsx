import { eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { displayIntermediateCa } from "@/lib/ca-display";
import { db } from "@/lib/db";
import { certificates, logos } from "@/lib/db/schema";
import { colors, OG_HEIGHT, OG_WIDTH } from "@/lib/og/card-styles";
import { getOgFonts } from "@/lib/og/fonts";
import { renderLogoToPngDataUri } from "@/lib/og/render-logo";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;

  const [logo] = await db.select({ svgContent: logos.svgContent }).from(logos).where(eq(logos.svgHash, hash)).limit(1);

  if (!logo?.svgContent) {
    return new Response("Not found", { status: 404 });
  }

  const [cert] = await db
    .select({
      subjectOrg: certificates.subjectOrg,
      certType: certificates.certType,
      issuerOrg: certificates.issuerOrg,
      sanList: certificates.sanList,
      industry: certificates.industry,
    })
    .from(certificates)
    .where(eq(certificates.logotypeSvgHash, hash))
    .limit(1);

  const fonts = await getOgFonts();
  const org = cert?.subjectOrg || "Unknown";
  const primaryDomain = cert?.sanList?.[0] ?? "";
  const certType = cert?.certType || "BIMI";
  const issuer = displayIntermediateCa(cert?.issuerOrg);

  let logoDataUri: string | null = null;
  try {
    logoDataUri = await renderLogoToPngDataUri(logo.svgContent, 440, 440);
  } catch {
    // SVG rendering failure
  }

  return new ImageResponse(
    <div
      style={{
        width: OG_WIDTH,
        height: OG_HEIGHT,
        background: `linear-gradient(145deg, ${colors.bg} 0%, #0F1A2E 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "IBM Plex Sans",
        gap: 40,
      }}
    >
      {/* Logo - big and centered */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 460,
          height: 460,
          borderRadius: 32,
          background: colors.cardBg,
          border: `2px solid ${colors.border}`,
          flexShrink: 0,
        }}
      >
        {logoDataUri ? (
          <img src={logoDataUri} width={440} height={440} style={{ objectFit: "contain" }} />
        ) : (
          <div style={{ display: "flex", color: colors.mono, fontSize: 24 }}>No Logo</div>
        )}
      </div>

      {/* Text block to the right */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxWidth: 560,
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 44,
            fontWeight: 700,
            color: colors.textPrimary,
            lineClamp: 2,
            overflow: "hidden",
          }}
        >
          {org.length > 30 ? org.slice(0, 28) + "…" : org}
        </div>

        {primaryDomain && <div style={{ fontSize: 26, color: colors.textSecondary }}>{primaryDomain}</div>}

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              display: "flex",
              background: colors.badgeBg,
              color: colors.badgeText,
              padding: "6px 16px",
              borderRadius: 8,
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            {certType}
          </div>
          <div style={{ fontSize: 20, color: colors.mono }}>{issuer}</div>
        </div>

        {cert?.industry && <div style={{ fontSize: 18, color: colors.mono, opacity: 0.7 }}>{cert.industry}</div>}
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
