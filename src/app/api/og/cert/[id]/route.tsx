import { sql } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { displayIntermediateCa, displayRootCa } from "@/lib/ca-display";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { colors, daysRemainingText, OG_HEIGHT, OG_WIDTH, validityColor } from "@/lib/og/card-styles";
import { getOgFonts } from "@/lib/og/fonts";
import { renderLogoToPngDataUri } from "@/lib/og/render-logo";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [cert] = await db
    .select({
      fingerprintSha256: certificates.fingerprintSha256,
      subjectOrg: certificates.subjectOrg,
      certType: certificates.certType,
      markType: certificates.markType,
      issuerOrg: certificates.issuerOrg,
      rootCaOrg: certificates.rootCaOrg,
      notBefore: certificates.notBefore,
      notAfter: certificates.notAfter,
      sanList: certificates.sanList,
      logotypeSvg: certificates.logotypeSvg,
      logotypeSvgHash: certificates.logotypeSvgHash,
      industry: certificates.industry,
      notabilityScore: certificates.notabilityScore,
    })
    .from(certificates)
    .where(sql`${certificates.fingerprintSha256} LIKE ${id + "%"}`)
    .limit(1);

  if (!cert) {
    return new Response("Not found", { status: 404 });
  }

  const fonts = await getOgFonts();
  const org = cert.subjectOrg || "Unknown Organization";
  const primaryDomain = cert.sanList?.[0] ?? "";
  const issuer = displayIntermediateCa(cert.issuerOrg);
  const rootCa = displayRootCa(cert.rootCaOrg);
  const certType = cert.certType || "BIMI";
  const vColor = validityColor(cert.notAfter);
  const daysText = daysRemainingText(cert.notAfter);
  const issuerChain = issuer !== rootCa && cert.rootCaOrg ? `${issuer} → ${rootCa}` : issuer;

  let logoDataUri: string | null = null;
  if (cert.logotypeSvg) {
    try {
      logoDataUri = await renderLogoToPngDataUri(cert.logotypeSvg, 400, 400);
    } catch {
      // SVG rendering can fail for malformed logos
    }
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
        gap: 48,
      }}
    >
      {/* Logo - big and prominent */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 420,
          height: 420,
          borderRadius: 32,
          background: colors.cardBg,
          border: `2px solid ${colors.border}`,
          flexShrink: 0,
        }}
      >
        {logoDataUri ? (
          <img src={logoDataUri} width={400} height={400} style={{ objectFit: "contain" }} />
        ) : (
          <div style={{ display: "flex", color: colors.mono, fontSize: 22 }}>No Logo</div>
        )}
      </div>

      {/* Metadata - condensed */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          maxWidth: 560,
          justifyContent: "center",
        }}
      >
        {/* Org name + badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              color: colors.textPrimary,
              lineClamp: 1,
              overflow: "hidden",
            }}
          >
            {org.length > 26 ? org.slice(0, 24) + "…" : org}
          </div>
          <div
            style={{
              display: "flex",
              background: colors.badgeBg,
              color: colors.badgeText,
              padding: "6px 16px",
              borderRadius: 8,
              fontSize: 20,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {certType}
          </div>
        </div>

        {/* Primary domain */}
        {primaryDomain && <div style={{ fontSize: 26, color: colors.textSecondary }}>{primaryDomain}</div>}

        {/* Issuer chain */}
        <div style={{ display: "flex", fontSize: 22, color: colors.textSecondary, opacity: 0.8 }}>
          {`Issued by ${issuerChain}`}
        </div>

        {/* Validity */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 22,
              color: vColor,
              fontWeight: 700,
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 5, background: vColor }} />
            {daysText}
          </div>
        </div>

        {cert.industry && (
          <div
            style={{
              display: "flex",
              background: colors.border,
              color: colors.textPrimary,
              padding: "4px 14px",
              borderRadius: 8,
              fontSize: 16,
              alignSelf: "flex-start",
            }}
          >
            {cert.industry}
          </div>
        )}
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
