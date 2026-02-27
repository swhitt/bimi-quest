import { ImageResponse } from "next/og";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { getOgFonts } from "@/lib/og/fonts";
import { renderLogoToPngDataUri } from "@/lib/og/render-logo";
import {
  colors,
  OG_WIDTH,
  OG_HEIGHT,
  validityColor,
  daysRemainingText,
  fmtDate,
  shortFingerprint,
  formatSans,
} from "@/lib/og/card-styles";
import { displayIssuerOrg, displayRootCa } from "@/lib/ca-display";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
    })
    .from(certificates)
    .where(
      and(
        sql`${certificates.fingerprintSha256} LIKE ${id + "%"}`,
        isNotNull(certificates.fingerprintSha256),
      ),
    )
    .limit(1);

  if (!cert) {
    return new Response("Not found", { status: 404 });
  }

  const fonts = await getOgFonts();
  const org = cert.subjectOrg || "Unknown Organization";
  const primaryDomain = cert.sanList?.[0] ?? "";
  const issuer = displayIssuerOrg(cert.issuerOrg);
  const rootCa = displayRootCa(cert.rootCaOrg);
  const certType = cert.certType || "BIMI";
  const vColor = validityColor(cert.notAfter);
  const daysText = daysRemainingText(cert.notAfter);
  const sansText = formatSans(cert.sanList ?? [], 4);
  const fp = shortFingerprint(cert.fingerprintSha256);
  const issuerChain =
    issuer !== rootCa && cert.rootCaOrg ? `${issuer} → ${rootCa}` : issuer;

  let logoDataUri: string | null = null;
  if (cert.logotypeSvg) {
    try {
      logoDataUri = await renderLogoToPngDataUri(cert.logotypeSvg, 200, 200);
    } catch {
      // SVG rendering can fail for malformed logos
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
          fontFamily: "IBM Plex Sans",
          padding: 0,
        }}
      >
        {/* Main content area */}
        <div
          style={{
            display: "flex",
            flex: 1,
            padding: "48px 56px 24px",
            gap: 48,
          }}
        >
          {/* Left: Logo */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 280,
              minWidth: 280,
              height: 280,
              borderRadius: 24,
              background: colors.cardBg,
              border: `2px solid ${colors.border}`,
            }}
          >
            {logoDataUri ? (
              <img
                src={logoDataUri}
                width={200}
                height={200}
                style={{ objectFit: "contain" }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: colors.mono,
                  fontSize: 18,
                }}
              >
                No Logo
              </div>
            )}
          </div>

          {/* Right: Metadata */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              gap: 12,
              justifyContent: "center",
            }}
          >
            {/* Org name + badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  fontSize: 40,
                  fontWeight: 700,
                  color: colors.textPrimary,
                  lineClamp: 1,
                  overflow: "hidden",
                }}
              >
                {org.length > 30 ? org.slice(0, 28) + "…" : org}
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
                }}
              >
                {certType}
              </div>
            </div>

            {/* Primary domain */}
            {primaryDomain && (
              <div style={{ fontSize: 26, color: colors.textSecondary }}>
                {primaryDomain}
              </div>
            )}

            {/* Issuer chain */}
            <div
              style={{
                display: "flex",
                fontSize: 22,
                color: colors.textSecondary,
                opacity: 0.8,
              }}
            >
              {`Issued by ${issuerChain}`}
            </div>

            {/* Validity */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 20, color: colors.mono }}>
                {`${fmtDate(cert.notBefore)} → ${fmtDate(cert.notAfter)}`}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 20,
                  color: vColor,
                  fontWeight: 700,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    background: vColor,
                  }}
                />
                {daysText}
              </div>
            </div>

            {/* SANs */}
            {sansText && (
              <div
                style={{
                  fontSize: 18,
                  color: colors.mono,
                }}
              >
                {`SANs: ${sansText}`}
              </div>
            )}

            {/* Fingerprint */}
            <div
              style={{
                fontSize: 16,
                color: colors.mono,
                opacity: 0.7,
                fontFamily: "monospace",
              }}
            >
              {`SHA256: ${fp}`}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 56px",
            background: "#080E1A",
          }}
        >
          <div style={{ fontSize: 18, color: colors.watermark, fontWeight: 700 }}>
            bimi.quest
          </div>
          <div style={{ fontSize: 16, color: colors.mono, opacity: 0.6 }}>
            {`crt.sh/?q=${cert.fingerprintSha256.slice(0, 16)}`}
          </div>
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
