# BIMI Quest

BIMI certificate market intelligence tool. Scans DigiCert's Gorgon CT log for VMC/CMC certificates, enriches data, and presents it through a dashboard.

## Stack

- Next.js 16 (App Router, Server Components, TypeScript)
- PostgreSQL via Neon (@neondatabase/serverless)
- Drizzle ORM (schema in `src/lib/db/schema.ts`)
- TanStack Table, Recharts, shadcn/ui, Tailwind CSS 4
- @peculiar/x509 for certificate parsing
- bun as package manager

## Key Paths

- `src/lib/db/` - Database schema and connection (lazy singleton)
- `src/lib/ct/` - CT log client (gorgon.ts), cert parser (parser.ts), shared ingestion loop (ingest-batch.ts), crt.sh client
- `src/lib/bimi/` - DNS, DMARC, SVG validation, full validation orchestrator
- `src/lib/notifications/` - Discord webhooks, notification dispatcher (only notifies for notability score >= 5)
- `src/workers/ingest.ts` - Standalone ingestion worker (backfill/stream/reparse/rescore/check modes)
- `src/app/api/` - API routes (dashboard, certificates, validate, proxy/svg, stats)
- `src/components/` - Dashboard widgets, tables, UI components

## Commands

- `bun run dev` - Development server
- `bun run build` - Production build
- `bunx biome format --write <files>` - Auto-format before committing (enforced by lefthook pre-commit)
- `bun run ingest:backfill` - Scan Gorgon CT log from last cursor
- `bun run ingest:stream` - Long-running poller for new entries
- `bun run db:push` - Push schema to database
- `bun run db:generate` - Generate migration files
- `bun run db:studio` - Open Drizzle Studio

## Environment Variables

- `DATABASE_URL` - Neon PostgreSQL connection string (required)
- `DISCORD_WEBHOOK_URL` - Discord webhook for notifications (optional)
- `NEXT_PUBLIC_BASE_URL` - Base URL for links in notifications
- `CRON_SECRET` - Shared secret for authenticating cron API endpoints (optional)

## Important Notes

- React Compiler is enabled — ESLint enforces `react-hooks/preserve-manual-memoization`. Functions used in `useCallback`/`useMemo` deps must be at module scope or stable; defining them inside the component triggers warnings.
- Lefthook pre-commit runs biome-format, typecheck (tsc --noEmit), and eslint. All must pass.
- Filter state: URL is source of truth, sessionStorage (`src/lib/filter-storage.ts`) is a cross-navigation safety net. Nav links carry filters via query params.
- DB connection is lazy (via Proxy) to avoid build-time errors when DATABASE_URL is unset
- The ingestion worker runs via tsx which resolves @/ aliases from tsconfig paths
- Both cron and worker use `processIngestBatch` from `src/lib/ct/ingest-batch.ts` (single source of truth)
- Worker keeps a raw `neon()` sql template tag for utility modes (reparse, rescore, check) that use raw SQL
- BIMI OIDs: 1.3.6.1.5.5.7.1.12 (logotype), 1.3.6.1.4.1.53087.1.13 (mark type)
- Uint8Array -> ArrayBuffer conversions are needed for @peculiar/x509 with strict TS
- `deriveCertType` in parser.ts is the canonical source for VMC/CMC classification
- Save all screenshots to `screenshots/YYYY-MM-DD-plan-name/NN-description.png` (gitignored). One dir per plan session, numbering from 01. Check existing files to get the next number. Take the screenshot first, then name it based on what's visible
- **Git commits must NEVER include Amp/AI attribution.** No `Co-authored-by: Amp`, no `Amp-Thread-ID` trailers, no AI tool references in commit messages. All commits should appear as normal human commits.
