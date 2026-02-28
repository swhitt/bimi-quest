# BIMI Quest — Audit TODO

Remaining items from the Feb 26 codebase audit. See `AUDIT-REPORT.md` for full details.

## Pending

| # | Task | Audit ID | Priority |
|---|------|----------|----------|
| 2 | Replace `excludeDuplicatePrecerts` correlated subquery with materialized column | 1.1 | HIGH |
| 3 | Migrate rate limiter to distributed store (Redis/Upstash) | 3.2 | MEDIUM |
| 4 | Remove CSP `unsafe-inline` for scripts, use nonces | 3.3 | MEDIUM |
| 5 | Convert dashboard from client-side fetch to RSC | 5.1 | HIGH |
| 6 | Add lazy loading for logo images (intersection observer) | 5.2 | HIGH |
| 12 | Add tests for revocation.ts, parser.ts, rate-limit.ts | P0 | CRITICAL |
| 13 | Add tests for notability.ts, ca-display.ts, filters.ts | P1 | HIGH |
| 14 | Add tests for SVG proxy, certificates route, revocation route | P2 | MEDIUM |
| 16 | Add error reporting service (Sentry/Datadog) | 6.2 | LOW |
| 18 | Add observability: request IDs, cache headers, RL logging, query timing | 6.5-6.8 | MEDIUM |
| 20 | Add keyboard accessibility to WorldMap | AA-4 | MEDIUM |
| 23 | Expand Zod validation to more API routes | 9.6 | LOW |

## Completed

| # | Task | Audit ID |
|---|------|----------|
| 1 | Add revalidate to sitemap.ts | — |
| 7 | Fix XFF IP spoofing in rate limiter | 3.1 |
| 8 | Remove unused crtsh.ts | 10.9 |
| 9 | Fix entry `break` vs `continue` in ingest-batch | 4.8 |
| 10 | Add Discord webhook retry on 429 | 4.9 |
| 11 | Add timeouts to Discord fetches | 4.11 |
| 15 | Add vitest coverage config | infra |
| 17 | Add client-side analytics (@vercel/analytics) | 6.9 |
| 19 | Add aria-sort to sort buttons, aria-expanded to filter toggle | A-1, AA-1 |
| 22 | Fix validate 500 response missing rate limit headers | 9.5 |
