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
- `src/lib/ct/` - CT log client (gorgon.ts), cert parser (parser.ts), crt.sh client
- `src/lib/bimi/` - DNS, DMARC, SVG validation, full validation orchestrator
- `src/lib/notifications/` - Discord webhooks, notification dispatcher
- `src/workers/ingest.ts` - Standalone ingestion worker (backfill/stream modes)
- `src/app/api/` - API routes (dashboard, certificates, validate, proxy/svg, stats)
- `src/components/` - Dashboard widgets, tables, UI components

## Commands
- `bun run dev` - Development server
- `bun run build` - Production build
- `bun run ingest:backfill` - Scan Gorgon CT log from last cursor
- `bun run ingest:stream` - Long-running poller for new entries
- `bun run db:push` - Push schema to database
- `bun run db:generate` - Generate migration files
- `bun run db:studio` - Open Drizzle Studio

## Environment Variables
- `DATABASE_URL` - Neon PostgreSQL connection string (required)
- `DISCORD_WEBHOOK_URL` - Discord webhook for notifications (optional)
- `NEXT_PUBLIC_BASE_URL` - Base URL for links in notifications

## Important Notes
- DB connection is lazy (via Proxy) to avoid build-time errors when DATABASE_URL is unset
- The ingestion worker uses relative imports (not @/ aliases) since it runs via tsx
- BIMI OIDs: 1.3.6.1.5.5.7.1.12 (logotype), 1.3.6.1.4.1.53087.1.13 (mark type)
- Uint8Array -> ArrayBuffer conversions are needed for @peculiar/x509 with strict TS
