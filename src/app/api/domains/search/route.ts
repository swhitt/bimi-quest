import { type SQL, and, asc, desc, gte, lte, or, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { parseDate } from "@/lib/db/filters";
import { domainBimiState } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Allowlist for JSONB path access via dns_snapshot
// ---------------------------------------------------------------------------

const ALLOWED_PATHS = new Set([
  "bimi.raw",
  "bimi.version",
  "bimi.logoUrl",
  "bimi.authorityUrl",
  "bimi.lps",
  "bimi.avp",
  "bimi.declined",
  "bimi.selector",
  "bimi.orgDomainFallback",
  "dmarc.raw",
  "dmarc.policy",
  "dmarc.sp",
  "dmarc.pct",
  "dmarc.rua",
  "dmarc.ruf",
  "dmarc.adkim",
  "dmarc.aspf",
  "dmarc.validForBimi",
  "svg.found",
  "svg.tinyPsValid",
  "svg.sizeBytes",
  "svg.contentType",
  "svg.indicatorHash",
  "certificate.found",
  "certificate.certType",
  "certificate.issuer",
  "certificate.authorityUrl",
  "meta.grade",
]);

const VALID_OPS = new Set(["eq", "neq", "contains", "exists", "not_exists"]);

/** Escape ILIKE metacharacters (%, _, \) to prevent wildcard amplification DoS. */
function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

const VALID_SORT_COLUMNS = new Set(["lastChecked", "domain", "bimiGrade", "dmarcPolicy"]);

// ---------------------------------------------------------------------------
// Query param schema
// ---------------------------------------------------------------------------

const searchQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.string().default("lastChecked"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

// ---------------------------------------------------------------------------
// Filter predicate type
// ---------------------------------------------------------------------------

interface FilterPredicate {
  path: string;
  op: string;
  value?: string;
}

/**
 * Parse the `f` query param (comma-separated triplets) into filter predicates.
 * Format: `path:op:value` or `path:op` (for exists/not_exists)
 */
function parseFilterParam(raw: string): FilterPredicate[] {
  if (!raw) return [];
  return raw.split(",").map((segment) => {
    const parts = segment.split(":");
    return {
      path: parts[0],
      op: parts[1] ?? "eq",
      value: parts.slice(2).join(":") || undefined, // rejoin in case value contains colons
    };
  });
}

/**
 * Map JSONB dot-paths to flat columns where available.
 * Falls back to JSONB extraction when no flat column exists.
 */
const FLAT_COLUMN_MAP: Record<string, SQL> = {
  "bimi.version": sql`${domainBimiState.bimiVersion}`,
  "bimi.logoUrl": sql`${domainBimiState.bimiLogoUrl}`,
  "bimi.authorityUrl": sql`${domainBimiState.bimiAuthorityUrl}`,
  "bimi.lps": sql`${domainBimiState.bimiLpsTag}`,
  "bimi.avp": sql`${domainBimiState.bimiAvpTag}`,
  "bimi.declined": sql`${domainBimiState.bimiDeclination}::text`,
  "bimi.selector": sql`${domainBimiState.bimiSelector}`,
  "dmarc.policy": sql`${domainBimiState.dmarcPolicy}`,
  "dmarc.validForBimi": sql`${domainBimiState.dmarcValid}::text`,
  "svg.found": sql`${domainBimiState.svgFetched}::text`,
  "svg.tinyPsValid": sql`${domainBimiState.svgTinyPsValid}::text`,
  "svg.contentType": sql`${domainBimiState.svgContentType}`,
  "svg.sizeBytes": sql`${domainBimiState.svgSizeBytes}::text`,
  "svg.indicatorHash": sql`${domainBimiState.svgIndicatorHash}`,
  "meta.grade": sql`${domainBimiState.bimiGrade}`,
};

/**
 * Pre-built JSONB extraction expressions for paths not covered by flat columns.
 * Uses static SQL fragments instead of sql.raw() to avoid any interpolation risk.
 */
const JSONB_PATH_MAP: Record<string, SQL> = {
  "bimi.raw": sql`${domainBimiState.dnsSnapshot}->'bimi'->>'raw'`,
  "bimi.orgDomainFallback": sql`${domainBimiState.dnsSnapshot}->'bimi'->>'orgDomainFallback'`,
  "dmarc.raw": sql`${domainBimiState.dnsSnapshot}->'dmarc'->>'raw'`,
  "dmarc.sp": sql`${domainBimiState.dnsSnapshot}->'dmarc'->>'sp'`,
  "dmarc.pct": sql`${domainBimiState.dnsSnapshot}->'dmarc'->>'pct'`,
  "dmarc.rua": sql`${domainBimiState.dnsSnapshot}->'dmarc'->>'rua'`,
  "dmarc.ruf": sql`${domainBimiState.dnsSnapshot}->'dmarc'->>'ruf'`,
  "dmarc.adkim": sql`${domainBimiState.dnsSnapshot}->'dmarc'->>'adkim'`,
  "dmarc.aspf": sql`${domainBimiState.dnsSnapshot}->'dmarc'->>'aspf'`,
  "certificate.found": sql`${domainBimiState.dnsSnapshot}->'certificate'->>'found'`,
  "certificate.certType": sql`${domainBimiState.dnsSnapshot}->'certificate'->>'certType'`,
  "certificate.issuer": sql`${domainBimiState.dnsSnapshot}->'certificate'->>'issuer'`,
  "certificate.authorityUrl": sql`${domainBimiState.dnsSnapshot}->'certificate'->>'authorityUrl'`,
};

/**
 * Resolve a dot-path to a SQL expression — flat column if available,
 * otherwise pre-built JSONB extraction from dns_snapshot.
 */
function pathToSql(path: string): SQL {
  if (FLAT_COLUMN_MAP[path]) return FLAT_COLUMN_MAP[path];
  if (JSONB_PATH_MAP[path]) return JSONB_PATH_MAP[path];
  // Should be unreachable since paths are validated against ALLOWED_PATHS first
  throw new Error(`No SQL mapping for path: ${path}`);
}

/**
 * Build a single WHERE condition from a filter predicate.
 */
function buildFilterCondition(pred: FilterPredicate): SQL | null {
  const pathExpr = pathToSql(pred.path);

  switch (pred.op) {
    case "eq":
      return sql`${pathExpr} = ${pred.value ?? ""}`;
    case "neq":
      return sql`${pathExpr} != ${pred.value ?? ""}`;
    case "contains":
      return sql`${pathExpr} ILIKE ${"%" + escapeIlike(pred.value ?? "") + "%"} ESCAPE '\\'`;
    case "exists":
      return sql`${pathExpr} IS NOT NULL`;
    case "not_exists":
      return sql`${pathExpr} IS NULL`;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const parsed = searchQuerySchema.safeParse({
    page: params.get("page") ?? undefined,
    limit: params.get("limit") ?? undefined,
    sort: params.get("sort") ?? undefined,
    dir: params.get("dir") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters", details: parsed.error.issues }, { status: 400 });
  }

  const { page, limit, sort, dir } = parsed.data;
  const offset = (page - 1) * limit;
  const q = params.get("q")?.trim() ?? "";
  const filterRaw = params.get("f") ?? "";

  // Validate sort column
  if (!VALID_SORT_COLUMNS.has(sort)) {
    return NextResponse.json({ error: `Invalid sort column: ${sort}` }, { status: 400 });
  }

  // Parse and validate filters
  const filters = parseFilterParam(filterRaw);
  for (const f of filters) {
    if (!ALLOWED_PATHS.has(f.path)) {
      return NextResponse.json({ error: `Invalid filter path: ${f.path}` }, { status: 400 });
    }
    if (!VALID_OPS.has(f.op)) {
      return NextResponse.json({ error: `Invalid filter operator: ${f.op}` }, { status: 400 });
    }
  }

  try {
    const conditions: SQL[] = [];

    // Full-text search across domain and raw record fields (works pre-JSONB backfill)
    if (q) {
      const pattern = `%${escapeIlike(q)}%`;
      conditions.push(
        or(
          sql`${domainBimiState.domain} ILIKE ${pattern} ESCAPE '\\'`,
          sql`${domainBimiState.bimiRecordRaw} ILIKE ${pattern} ESCAPE '\\'`,
          sql`${domainBimiState.dmarcRecordRaw} ILIKE ${pattern} ESCAPE '\\'`,
        )!,
      );
    }

    // JSONB filter predicates
    for (const pred of filters) {
      const cond = buildFilterCondition(pred);
      if (cond) conditions.push(cond);
    }

    // Global filter params (from the shared filter bar)
    const caFilter = params.get("ca")?.trim();
    const typeFilter = params.get("type")?.trim();
    const fromDate = parseDate(params.get("from"));
    const toDate = parseDate(params.get("to"));

    if (caFilter) {
      conditions.push(
        sql`${domainBimiState.dnsSnapshot}->'certificate'->>'issuer' ILIKE ${
          "%" + escapeIlike(caFilter) + "%"
        } ESCAPE '\\'`,
      );
    }
    if (typeFilter === "VMC" || typeFilter === "CMC") {
      conditions.push(sql`${domainBimiState.dnsSnapshot}->'certificate'->>'certType' = ${typeFilter}`);
    }
    if (fromDate) conditions.push(gte(domainBimiState.lastChecked, fromDate));
    if (toDate) conditions.push(lte(domainBimiState.lastChecked, toDate));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Sort column mapping
    const sortColumnMap = {
      lastChecked: domainBimiState.lastChecked,
      domain: domainBimiState.domain,
      bimiGrade: domainBimiState.bimiGrade,
      dmarcPolicy: domainBimiState.dmarcPolicy,
    } as const;
    const sortCol = sortColumnMap[sort as keyof typeof sortColumnMap];
    const orderFn = dir === "asc" ? asc : desc;

    // Single query with count(*) OVER() to avoid a separate count round-trip
    const rows = await db
      .select({
        domain: domainBimiState.domain,
        bimiGrade: domainBimiState.bimiGrade,
        dmarcPolicy: domainBimiState.dmarcPolicy,
        bimiLogoUrl: domainBimiState.bimiLogoUrl,
        bimiAuthorityUrl: domainBimiState.bimiAuthorityUrl,
        svgTinyPsValid: domainBimiState.svgTinyPsValid,
        dmarcValid: domainBimiState.dmarcValid,
        lastChecked: domainBimiState.lastChecked,
        _total: sql<number>`count(*) OVER()`.as("_total"),
      })
      .from(domainBimiState)
      .where(where)
      .orderBy(orderFn(sortCol))
      .limit(limit)
      .offset(offset);

    const total = rows.length > 0 ? rows[0]._total : 0;
    const data = rows.map(({ _total: _, ...rest }) => rest);

    return NextResponse.json(
      {
        data,
        pagination: {
          total,
          page,
          totalPages: Math.ceil(total / limit),
          limit,
        },
      },
      {
        headers: { "Cache-Control": CACHE_PRESETS.SHORT },
      },
    );
  } catch (error) {
    return apiError(error, "domains.search.failed", "/api/domains/search", "Failed to search domains");
  }
}
