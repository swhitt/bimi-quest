import { and, desc, gte, isNotNull } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { renderLogoToPng } from "./render-logo";

const GRID = 8;
const TILE_W = 150;
const TILE_H = 78;
const WIDTH = 1200;
const HEIGHT = 630;

/**
 * Generate an 8x8 mosaic of the top 64 logos (score >= 7, most recent).
 * Returns a PNG buffer.
 */
export async function generateMosaic(): Promise<Buffer> {
  const rows = await db
    .select({
      logotypeSvg: certificates.logotypeSvg,
      subjectOrg: certificates.subjectOrg,
    })
    .from(certificates)
    .where(and(isNotNull(certificates.logotypeSvg), gte(certificates.notabilityScore, 7)))
    .orderBy(desc(certificates.notBefore))
    .limit(GRID * GRID);

  // Render each SVG to a PNG tile
  const tiles: { buffer: Buffer; col: number; row: number }[] = [];
  await Promise.all(
    rows.map(async (row, i) => {
      if (!row.logotypeSvg) return;
      try {
        const png = await renderLogoToPng(row.logotypeSvg, TILE_W, TILE_H);
        tiles.push({
          buffer: png,
          col: i % GRID,
          row: Math.floor(i / GRID),
        });
      } catch {
        // Skip malformed SVGs
      }
    }),
  );

  // Composite onto dark background
  const composite = tiles.map((t) => ({
    input: t.buffer,
    left: t.col * TILE_W,
    top: t.row * TILE_H + Math.floor((HEIGHT - GRID * TILE_H) / 2),
  }));

  return sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 12, g: 18, b: 34, alpha: 255 },
    },
  })
    .composite(composite)
    .png()
    .toBuffer();
}
