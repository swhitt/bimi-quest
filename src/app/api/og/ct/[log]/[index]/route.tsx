import { ImageResponse } from "next/og";
import { decodeCTEntry } from "@/lib/ct/decode-entry";
import { getEntries, getSTH } from "@/lib/ct/gorgon";
import { colors, OG_HEIGHT, OG_WIDTH } from "@/lib/og/card-styles";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";

const KNOWN_LOGS = new Set(["gorgon"]);

export async function GET(_request: Request, { params }: { params: Promise<{ log: string; index: string }> }) {
  const { log, index: indexStr } = await params;

  if (!KNOWN_LOGS.has(log)) {
    return new Response("Unknown CT log", { status: 404 });
  }

  const index = parseInt(indexStr, 10);
  if (!Number.isFinite(index) || index < 0) {
    return new Response("Invalid index", { status: 400 });
  }

  const sth = await getSTH();
  if (index >= sth.tree_size) {
    return new Response("Index beyond tree size", { status: 404 });
  }

  const response = await getEntries(index, index);
  if (!response.entries.length) {
    return new Response("Entry not found", { status: 404 });
  }

  const decoded = await decodeCTEntry(response.entries[0], index);
  const fonts = await getOgFonts();

  const subject = decoded.cert?.subject || "Unknown Subject";
  const issuer = decoded.cert?.issuer || "Unknown Issuer";
  const isPrecert = decoded.leaf.entryType === "precert_entry";
  const isBIMI = decoded.cert?.isBIMI ?? false;
  const timestamp = decoded.leaf.timestampDate;
  const fingerprint = decoded.cert?.fingerprint;

  // First ~48 hex chars for the visual strip
  const hexPreview = decoded.raw.leafHex.slice(0, 96).replace(/(..)/g, "$1 ").trim();

  return new ImageResponse(
    <div
      style={{
        width: OG_WIDTH,
        height: OG_HEIGHT,
        background: `linear-gradient(145deg, ${colors.bg} 0%, #0F1A2E 100%)`,
        display: "flex",
        flexDirection: "column",
        fontFamily: "IBM Plex Sans",
      }}
    >
      {/* Main content */}
      <div style={{ display: "flex", flex: 1, padding: "48px 56px 24px", gap: 48 }}>
        {/* Left: Index card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: 280,
            minWidth: 280,
            height: 280,
            borderRadius: 24,
            background: colors.cardBg,
            border: `2px solid ${colors.border}`,
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 16,
              color: colors.mono,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Entry
          </div>
          <div style={{ fontSize: 56, fontWeight: 700, color: colors.textPrimary }}>#{index.toLocaleString()}</div>
          <div
            style={{
              display: "flex",
              background: isPrecert ? "#374151" : colors.badgeBg,
              color: isPrecert ? "#D1D5DB" : colors.badgeText,
              padding: "6px 16px",
              borderRadius: 8,
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            {isPrecert ? "Precert" : "X.509"}
          </div>
          {isBIMI && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: colors.validGreen,
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  background: colors.validGreen,
                }}
              />
              BIMI
            </div>
          )}
        </div>

        {/* Right: Metadata */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            gap: 16,
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: colors.textPrimary,
              overflow: "hidden",
            }}
          >
            {subject.length > 40 ? `${subject.slice(0, 38)}…` : subject}
          </div>

          <div style={{ fontSize: 22, color: colors.textSecondary }}>
            {`Issued by ${issuer.length > 50 ? `${issuer.slice(0, 48)}…` : issuer}`}
          </div>

          <div style={{ fontSize: 20, color: colors.mono }}>{timestamp}</div>

          {/* Hex bytes strip */}
          <div
            style={{
              fontSize: 14,
              color: colors.mono,
              opacity: 0.4,
              fontFamily: "monospace",
              letterSpacing: "0.05em",
            }}
          >
            {hexPreview}
          </div>

          {fingerprint && (
            <div
              style={{
                fontSize: 16,
                color: colors.mono,
                opacity: 0.7,
                fontFamily: "monospace",
              }}
            >
              {`SHA256: ${fingerprint.slice(0, 24)}…`}
            </div>
          )}
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
        <div style={{ fontSize: 18, color: colors.watermark, fontWeight: 700 }}>bimi.quest</div>
        <div style={{ fontSize: 16, color: colors.mono, opacity: 0.6 }}>Gorgon CT Log</div>
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
