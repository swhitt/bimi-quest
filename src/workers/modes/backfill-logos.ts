import type { NeonQueryFunction } from "@neondatabase/serverless";

// ANSI color helpers
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  white: "\x1b[97m",
  gray: "\x1b[90m",
  bgCyan: "\x1b[46m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgMagenta: "\x1b[45m",
  black: "\x1b[30m",
};

function step(n: number, total: number, label: string) {
  return `${c.bold}${c.cyan}[${n}/${total}]${c.reset} ${c.white}${label}${c.reset}`;
}

function ok(msg: string) {
  return `      ${c.green}✓${c.reset} ${msg}`;
}

function info(msg: string) {
  return `      ${c.dim}${msg}${c.reset}`;
}

function banner(text: string) {
  const pad = " ".repeat(3);
  return `\n${c.bgCyan}${c.black}${c.bold}${pad}${text}${pad}${c.reset}\n`;
}

function elapsed(start: number): string {
  const ms = Date.now() - start;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const TOTAL_STEPS = 4;

export async function backfillLogos(sql: NeonQueryFunction<false, false>) {
  const t0 = Date.now();

  console.log(banner("BACKFILL LOGOS TABLE"));
  console.log(info("Migrating logo data from certificates + domain_bimi_state → logos\n"));

  // ── Step 1: Certs ─────────────────────────────────────────────────
  const t1 = Date.now();
  console.log(step(1, TOTAL_STEPS, "Inserting logos from certificates (grouped by SVG hash)..."));

  const [certCountRow] = (await sql`
    SELECT count(DISTINCT logotype_svg_hash)::int AS cnt
    FROM certificates
    WHERE logotype_svg_hash IS NOT NULL AND logotype_svg IS NOT NULL
  `) as [{ cnt: number }];
  console.log(info(`${certCountRow.cnt.toLocaleString()} unique SVG hashes in certificates table`));

  await sql`
    INSERT INTO logos (
      svg_hash, svg_content, visual_hash, tile_bg, color_richness,
      quality_score, quality_reason, svg_size_bytes,
      first_seen_at, last_seen_at, first_source, cert_count
    )
    SELECT
      logotype_svg_hash,
      (array_agg(logotype_svg ORDER BY notability_score DESC NULLS LAST))[1],
      (array_agg(logotype_visual_hash ORDER BY notability_score DESC NULLS LAST))[1],
      (array_agg(logo_tile_bg ORDER BY notability_score DESC NULLS LAST))[1],
      (array_agg(logo_color_richness ORDER BY notability_score DESC NULLS LAST))[1],
      (array_agg(logo_quality_score ORDER BY notability_score DESC NULLS LAST))[1],
      (array_agg(logo_quality_reason ORDER BY notability_score DESC NULLS LAST))[1],
      length((array_agg(logotype_svg ORDER BY notability_score DESC NULLS LAST))[1]),
      min(not_before),
      max(not_before),
      'cert',
      count(*)::int
    FROM certificates
    WHERE logotype_svg_hash IS NOT NULL AND logotype_svg IS NOT NULL
    GROUP BY logotype_svg_hash
    ON CONFLICT DO NOTHING
  `;

  const [afterCerts] = (await sql`SELECT count(*)::int AS cnt FROM logos`) as [{ cnt: number }];
  console.log(
    ok(
      `${c.bold}${afterCerts.cnt.toLocaleString()}${c.reset}${c.green} logos inserted from certs${c.reset} ${c.gray}(${elapsed(t1)})${c.reset}`,
    ),
  );

  // ── Step 2: DNS ───────────────────────────────────────────────────
  const t2 = Date.now();
  console.log(`\n${step(2, TOTAL_STEPS, "Merging logos from domain_bimi_state (DNS-discovered)...")}`);

  const [dnsCountRow] = (await sql`
    SELECT count(*)::int AS cnt
    FROM domain_bimi_state
    WHERE svg_indicator_hash IS NOT NULL AND svg_content IS NOT NULL
  `) as [{ cnt: number }];
  console.log(info(`${dnsCountRow.cnt.toLocaleString()} DNS rows with SVG content`));

  await sql`
    INSERT INTO logos (
      svg_hash, svg_content, svg_size_bytes,
      svg_tiny_ps_valid, svg_validation_errors, tile_bg,
      first_seen_at, last_seen_at, first_source, domain_count
    )
    SELECT
      svg_indicator_hash,
      (array_agg(svg_content ORDER BY last_checked DESC NULLS LAST))[1],
      (array_agg(svg_size_bytes ORDER BY last_checked DESC NULLS LAST))[1],
      bool_or(svg_tiny_ps_valid),
      (SELECT d.svg_validation_errors FROM domain_bimi_state d WHERE d.svg_indicator_hash = domain_bimi_state.svg_indicator_hash ORDER BY d.last_checked DESC NULLS LAST LIMIT 1),
      (array_agg(svg_tile_bg ORDER BY last_checked DESC NULLS LAST))[1],
      min(COALESCE(created_at, now())),
      max(COALESCE(last_checked, now())),
      'dns',
      count(*)::int
    FROM domain_bimi_state
    WHERE svg_indicator_hash IS NOT NULL AND svg_content IS NOT NULL
    GROUP BY svg_indicator_hash
    ON CONFLICT (svg_hash) DO UPDATE SET
      last_seen_at = GREATEST(logos.last_seen_at, EXCLUDED.last_seen_at),
      domain_count = logos.domain_count + EXCLUDED.domain_count,
      svg_tiny_ps_valid = COALESCE(logos.svg_tiny_ps_valid, EXCLUDED.svg_tiny_ps_valid),
      svg_validation_errors = COALESCE(logos.svg_validation_errors, EXCLUDED.svg_validation_errors),
      updated_at = now()
  `;

  const [afterDns] = (await sql`SELECT count(*)::int AS cnt FROM logos`) as [{ cnt: number }];
  const dnsNew = afterDns.cnt - afterCerts.cnt;
  console.log(
    ok(
      `${c.bold}${dnsNew.toLocaleString()}${c.reset}${c.green} new DNS-only logos, ${c.yellow}${(dnsCountRow.cnt - dnsNew).toLocaleString()}${c.reset}${c.green} merged with existing${c.reset} ${c.gray}(${elapsed(t2)})${c.reset}`,
    ),
  );

  // ── Step 3: Domain counts ─────────────────────────────────────────
  const t3 = Date.now();
  console.log(`\n${step(3, TOTAL_STEPS, "Recalculating domain_count from SANs + DNS records...")}`);

  await sql`
    UPDATE logos SET domain_count = sub.cnt
    FROM (
      SELECT svg_hash, count(DISTINCT d)::int AS cnt FROM (
        SELECT logotype_svg_hash AS svg_hash, unnest(san_list) AS d
        FROM certificates
        WHERE logotype_svg_hash IS NOT NULL
        UNION ALL
        SELECT svg_indicator_hash AS svg_hash, domain AS d
        FROM domain_bimi_state
        WHERE svg_indicator_hash IS NOT NULL
      ) combined
      GROUP BY svg_hash
    ) sub
    WHERE logos.svg_hash = sub.svg_hash
  `;
  console.log(ok(`domain_count updated ${c.gray}(${elapsed(t3)})${c.reset}`));

  // ── Step 4: Summary ───────────────────────────────────────────────
  console.log(`\n${step(4, TOTAL_STEPS, "Collecting stats...")}`);

  const [stats] = (await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE first_source = 'cert')::int AS from_cert,
      count(*) FILTER (WHERE first_source = 'dns')::int AS from_dns,
      count(*) FILTER (WHERE quality_score IS NOT NULL)::int AS scored,
      count(*) FILTER (WHERE visual_hash IS NOT NULL)::int AS hashed,
      avg(cert_count)::numeric(10,1) AS avg_certs,
      max(cert_count)::int AS max_certs,
      avg(domain_count)::numeric(10,1) AS avg_domains,
      max(domain_count)::int AS max_domains
    FROM logos
  `) as [Record<string, number>];

  console.log("");
  console.log(`  ${c.bgGreen}${c.black}${c.bold}   BACKFILL COMPLETE   ${c.reset}`);
  console.log("");
  console.log(`  ${c.bold}${c.white}${stats.total.toLocaleString()}${c.reset} logos total`);
  console.log(
    `  ${c.cyan}${stats.from_cert.toLocaleString()}${c.reset} from certs  ${c.dim}|${c.reset}  ${c.magenta}${stats.from_dns.toLocaleString()}${c.reset} from DNS`,
  );
  console.log(
    `  ${c.yellow}${stats.scored.toLocaleString()}${c.reset} quality-scored  ${c.dim}|${c.reset}  ${c.blue}${stats.hashed.toLocaleString()}${c.reset} visual-hashed`,
  );
  console.log(`  ${c.dim}avg ${stats.avg_certs} certs/logo (max ${stats.max_certs})${c.reset}`);
  console.log(`  ${c.dim}avg ${stats.avg_domains} domains/logo (max ${stats.max_domains})${c.reset}`);
  console.log(`\n  ${c.dim}Total time: ${elapsed(t0)}${c.reset}\n`);
}
