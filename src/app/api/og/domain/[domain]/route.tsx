import { eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { domainBimiState, logos } from "@/lib/db/schema";
import { colors, OG_HEIGHT, OG_WIDTH } from "@/lib/og/card-styles";
import { getOgFonts } from "@/lib/og/fonts";
import { renderLogoToPngDataUri } from "@/lib/og/render-logo";

export const runtime = "nodejs";

/** Grade → color mapping */
function gradeColor(grade: string | null): string {
  if (!grade) return colors.mono;
  if (grade.startsWith("A")) return colors.validGreen;
  if (grade.startsWith("B")) return colors.validAmber;
  return colors.validRed;
}

/** Status pill rendered in the OG image */
function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: colors.cardBg,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: "6px 16px",
        fontSize: 18,
        color: ok ? colors.validGreen : colors.validRed,
      }}
    >
      <span style={{ fontSize: 14 }}>{ok ? "✓" : "✗"}</span>
      {label}
    </div>
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain: rawDomain } = await params;
  const domain = decodeURIComponent(rawDomain).toLowerCase().replace(/\.$/, "");

  const rows = await db.select().from(domainBimiState).where(eq(domainBimiState.domain, domain)).limit(1);

  const row = rows[0] ?? null;
  const fonts = await getOgFonts();

  // Try to render the SVG logo from logos table
  let logoDataUri: string | null = null;
  if (row?.svgIndicatorHash) {
    const [logo] = await db
      .select({ svgContent: logos.svgContent })
      .from(logos)
      .where(eq(logos.svgHash, row.svgIndicatorHash))
      .limit(1);
    if (logo?.svgContent) {
      try {
        logoDataUri = await renderLogoToPngDataUri(logo.svgContent, 140, 140);
      } catch {
        // SVG rendering failure — continue without logo
      }
    }
  }

  const grade = row?.bimiGrade ?? null;
  const hasBimi = !!row?.bimiRecordRaw;
  const dmarcValid = row?.dmarcValid ?? false;
  const svgValid = !!row?.dnsSnapshot?.svg?.tinyPsValid;
  const hasCert = !!(row?.dnsSnapshot as Record<string, unknown> | null)?.certificate;

  return new ImageResponse(
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
        gap: 20,
      }}
    >
      {/* Logo + Domain row */}
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        {logoDataUri && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 160,
              height: 160,
              borderRadius: 20,
              background: colors.cardBg,
              border: `2px solid ${colors.border}`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src={logoDataUri} width={140} height={140} style={{ objectFit: "contain" }} />
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              fontSize: 44,
              fontWeight: 700,
              color: colors.textPrimary,
            }}
          >
            {domain.length > 30 ? domain.slice(0, 28) + "…" : domain}
          </div>

          {/* Grade badge */}
          {grade && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  fontSize: 24,
                  fontWeight: 700,
                  color: gradeColor(grade),
                }}
              >
                Grade {grade}
              </div>
              {row?.dmarcPolicy && <div style={{ fontSize: 20, color: colors.mono }}>DMARC: p={row.dmarcPolicy}</div>}
            </div>
          )}
        </div>
      </div>

      {/* Status pills */}
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <StatusPill label="BIMI Record" ok={hasBimi} />
        <StatusPill label="DMARC" ok={dmarcValid} />
        <StatusPill label="SVG Valid" ok={svgValid} />
        <StatusPill label="Certificate" ok={hasCert} />
      </div>

      {/* Subtitle */}
      <div style={{ fontSize: 18, color: colors.mono, marginTop: 4 }}>BIMI DNS Report Card</div>

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
