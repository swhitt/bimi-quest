# BIMI Intel

Competitive intelligence tool for the BIMI certificate market. Scans CT logs for VMC/CMC issuances across all CAs and shows who's winning.

## What it does

- Scans DigiCert's Gorgon CT log for certificates with BIMI OIDs
- Parses cert details, extracts mark types, SANs, chain info
- Stores everything in Postgres ([Neon](https://neon.tech))
- Dashboard with market share, trends, recent issuances
- Certificate browser with filtering, search, CSV export
- BIMI validator: enter any domain, get a full breakdown (DNS, DMARC, SVG, cert)
- Geographic distribution view
- Discord notifications when new BIMI certs appear

## Setup

```
cp .env.example .env
# fill in DATABASE_URL from Neon

bun install
bun run db:push
bun run dev
```

To populate data, run the ingestion worker:

```
bun run ingest:backfill   # scan historical entries (takes a while)
bun run ingest:stream     # poll for new entries every 30s
```

## Stack

Next.js 16, Drizzle, Neon Postgres, TanStack Table, Recharts, shadcn/ui, @peculiar/x509
