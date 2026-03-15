import type { NeonQueryFunction } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "./schema";
import { logos } from "./schema";

interface UpsertLogoInput {
  svgHash: string;
  svgContent: string;
  source: "cert" | "dns";
  seenAt: Date;
  svgSizeBytes?: number | null;
  svgTinyPsValid?: boolean | null;
  svgValidationErrors?: string[] | null;
  visualHash?: string | null;
  tileBg?: string | null;
  colorRichness?: number | null;
  qualityScore?: number | null;
  qualityReason?: string | null;
}

/** Drizzle upsert for cron/API paths. */
export async function upsertLogo(db: NeonHttpDatabase<typeof schema>, input: UpsertLogoInput) {
  await db
    .insert(logos)
    .values({
      svgHash: input.svgHash,
      svgContent: input.svgContent,
      firstSource: input.source,
      firstSeenAt: input.seenAt,
      lastSeenAt: input.seenAt,
      svgSizeBytes: input.svgSizeBytes ?? Buffer.byteLength(input.svgContent, "utf8"),
      svgTinyPsValid: input.svgTinyPsValid ?? null,
      svgValidationErrors: input.svgValidationErrors ?? null,
      visualHash: input.visualHash ?? null,
      tileBg: input.tileBg ?? null,
      colorRichness: input.colorRichness ?? null,
      qualityScore: input.qualityScore ?? null,
      qualityReason: input.qualityReason ?? null,
      certCount: input.source === "cert" ? 1 : 0,
      domainCount: input.source === "dns" ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: logos.svgHash,
      set: {
        lastSeenAt: sql`GREATEST(${logos.lastSeenAt}, ${input.seenAt})`,
        certCount: input.source === "cert" ? sql`${logos.certCount} + 1` : logos.certCount,
        domainCount: input.source === "dns" ? sql`${logos.domainCount} + 1` : logos.domainCount,
        updatedAt: sql`now()`,
      },
    });
}

/** Raw neon() SQL upsert for worker paths. */
export function upsertLogoSql(sqlTag: NeonQueryFunction<false, false>, input: UpsertLogoInput) {
  const sizeBytes = input.svgSizeBytes ?? Buffer.byteLength(input.svgContent, "utf8");
  const certCount = input.source === "cert" ? 1 : 0;
  const domainCount = input.source === "dns" ? 1 : 0;

  return sqlTag`
    INSERT INTO logos (
      svg_hash, svg_content, first_source, first_seen_at, last_seen_at,
      svg_size_bytes, svg_tiny_ps_valid, svg_validation_errors,
      visual_hash, tile_bg, color_richness, quality_score, quality_reason,
      cert_count, domain_count
    ) VALUES (
      ${input.svgHash}, ${input.svgContent}, ${input.source}, ${input.seenAt.toISOString()}, ${input.seenAt.toISOString()},
      ${sizeBytes}, ${input.svgTinyPsValid ?? null}, ${input.svgValidationErrors ?? null},
      ${input.visualHash ?? null}, ${input.tileBg ?? null}, ${input.colorRichness ?? null},
      ${input.qualityScore ?? null}, ${input.qualityReason ?? null},
      ${certCount}, ${domainCount}
    )
    ON CONFLICT (svg_hash) DO UPDATE SET
      last_seen_at = GREATEST(logos.last_seen_at, EXCLUDED.last_seen_at),
      cert_count = logos.cert_count + EXCLUDED.cert_count,
      domain_count = logos.domain_count + EXCLUDED.domain_count,
      updated_at = now()
  `;
}
