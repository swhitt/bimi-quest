# ASN.1 Explorer & DNS Search — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Two features that make BIMI Quest a power tool for PKI/BIMI professionals:

1. **ASN.1 Explorer** — Interactive DER structure viewer on certificate detail pages + standalone paste-and-explore tool at `/tools/asn1`
2. **DNS Search** — JSONB-backed searchable DNS record corpus with structured filters and full-text search at `/domains`

**Prime Directive:** Everything shareable via permalink. Every interesting state gets a URL. This is a tool people send to colleagues.

**Architecture:** Client-side DER parsing (extend existing `asn1.ts`). Server-side DNS search via JSONB + GIN index. All state in URL params for shareability.

**Tech Stack:** Next.js 16 App Router, Tailwind CSS 4, shadcn/ui, Drizzle ORM, existing `asn1.ts` + `decode-extensions.ts`

**Validation:** Use Chrome browser extension to screenshot after each visual task. Run at least 3 UI review agents (before, during, after) using browser automation.

---

## Part 1: ASN.1 Explorer

### Task 1: Extend asn1.ts with recursive tree builder

Add a `buildAsn1Tree()` function that takes raw DER bytes and returns a full recursive tree structure suitable for React rendering. This is the core parser that both the cert detail page and standalone tool will use.

**Files:**

- Create: `src/lib/x509/asn1-tree.ts`

**Details:**

Create a new file (not modify asn1.ts — keep the low-level primitives separate from the tree builder).

```typescript
// Types
export interface Asn1Node {
  tag: number;
  tagName: string;           // "SEQUENCE", "BIT STRING", "OID", etc.
  tagClass: "universal" | "application" | "context" | "private";
  constructed: boolean;
  headerOffset: number;      // byte offset of tag in the original buffer
  headerLength: number;      // tag + length bytes
  valueOffset: number;       // byte offset of value
  valueLength: number;
  totalLength: number;
  depth: number;
  // Decoded representations
  hex: string;               // raw value as hex
  decoded: string | null;    // human-readable decoded value (OID dotted string, UTF8 text, integer, etc.)
  oidName: string | null;    // friendly OID name if this is an OID node
  children: Asn1Node[];      // recursive children for constructed types
}
```

Tag name mapping: cover all universal tags (BOOLEAN, INTEGER, BIT STRING, OCTET STRING, NULL, OID, UTF8String, SEQUENCE, SET, PrintableString, T61String, IA5String, UTCTime, GeneralizedTime, BMPString, plus context-tagged `[0]`, `[1]`, etc.).

OID name lookup: import and merge the OID maps from `decode-entry.ts` (OID_NAMES, EKU_NAMES) and `decode-extensions.ts` (oidNames) into a single comprehensive map. Export it for reuse.

Value decoding per tag type:

- OID → dotted string + friendly name
- INTEGER → decimal (and hex if > 255)
- BIT STRING → hex + named bits for Key Usage OID context
- UTCTime/GeneralizedTime → ISO 8601 string
- String types → decoded text
- BOOLEAN → true/false
- NULL → (empty)
- OCTET STRING → hex (and attempt recursive parse if it looks like valid DER — common for extension values wrapped in OCTET STRING)
- Context-tagged → label as `[N]` with IMPLICIT/EXPLICIT hint

The function signature: `export function buildAsn1Tree(der: Uint8Array): Asn1Node`

Also export: `export function pemToDerBytes(pem: string): Uint8Array` — wrapper around existing `pemToDer` that handles both raw PEM and PEM with headers, base64, and hex input formats. This is for the standalone tool where users paste arbitrary formats.

Write unit tests in `src/lib/x509/asn1-tree.test.ts`:

- Parse a known small DER structure (e.g., a BasicConstraints extension value)
- Verify tag names, decoded OIDs, child counts
- Verify hex offset/length tracking is correct
- Test pemToDerBytes with PEM, raw base64, and hex input

---

### Task 2: Create Asn1Tree React component

A recursive collapsible tree component that renders an `Asn1Node`. This is the core UI primitive.

**Files:**

- Create: `src/components/x509/asn1-tree.tsx`

**Details:**

Design principles:

- Monospace font throughout. This is a dev tool.
- Each node shows: tag name (colored by class), length, decoded value (truncated if long)
- Constructed nodes are collapsible (triangle toggle). Default: first 2 levels expanded.
- Clicking a node selects it — highlights its byte range in a companion hex view (via callback prop)
- OID nodes show both dotted string AND friendly name (if known) in muted text
- Hex values use consistent formatting: `AB:CD:EF` with colons
- Context-tagged nodes show `[0] EXPLICIT` or `[1] IMPLICIT` labels
- Critical extensions get a red "CRITICAL" badge

Component API:

```tsx
interface Asn1TreeProps {
  root: Asn1Node;
  onSelectNode?: (node: Asn1Node) => void;
  selectedNode?: Asn1Node | null;
  defaultExpandDepth?: number;  // default 2
  className?: string;
}
```

Keyboard navigation: up/down arrows to move between visible nodes, left/right to collapse/expand, Enter to select.

Use Tailwind only, no additional CSS. Dark/light mode via existing theme tokens.

---

### Task 3: Create DerHexViewer component

A hex viewer that shows raw DER bytes with highlighting for the currently selected ASN.1 node. Reuse patterns from existing `hex-viewer.tsx` but simplified for DER-specific use.

**Files:**

- Create: `src/components/x509/der-hex-viewer.tsx`

**Details:**

This is a simplified version of the existing CT log `HexViewer` adapted for DER viewing:

- 16 bytes per row, address column on left
- Hex pairs in the middle, ASCII decode on right
- Selected node's bytes highlighted with a colored background
- Header bytes (tag + length) highlighted in a different shade than value bytes
- Hover any byte → tooltip shows which ASN.1 node it belongs to
- Compact: no legend needed (the tree IS the legend)

Component API:

```tsx
interface DerHexViewerProps {
  bytes: Uint8Array;
  highlightRange?: { start: number; end: number; headerEnd: number } | null;
  className?: string;
}
```

---

### Task 4: Add ASN.1 tab to certificate detail page

Wire up the tree + hex viewer as a new tab on the existing certificate detail page.

**Files:**

- Modify: `src/app/certificates/[id]/certificate-detail.tsx`

**Details:**

Add an "ASN.1" tab (after the existing tabs). When clicked:

1. Parse `rawPem` from the cert data using `buildAsn1Tree(pemToDerBytes(rawPem))`
2. Render split view: `<Asn1Tree>` on left (scrollable), `<DerHexViewer>` on right (scrollable, synced)
3. Selecting a node in the tree highlights bytes in the hex view and vice versa

The tab should be lazy-loaded (only parse when tab is activated) since DER parsing of large certs can be non-trivial.

**Permalink:** The tab state should be in the URL hash: `/certificates/123#asn1`. If a specific node path is selected, encode it: `/certificates/123#asn1/0/0/2` (child indices). On load, auto-expand to that node and scroll it into view. This lets people share links to specific extensions.

---

### Task 5: Create standalone ASN.1 playground page

A standalone page at `/tools/asn1` where users paste PEM, base64, or hex and explore the DER structure.

**Files:**

- Create: `src/app/tools/asn1/page.tsx`
- Create: `src/app/tools/asn1/asn1-playground.tsx` (client component)

**Details:**

Layout:

- Top: large textarea (monospace) with placeholder "Paste PEM, Base64, or hex-encoded DER..."
- Auto-detect input format (PEM headers → PEM, valid base64 → base64, hex chars → hex)
- Below: split view with Asn1Tree + DerHexViewer (same as cert detail tab)
- Error state: if parsing fails, show error message with byte offset where parsing broke

**Permalink:** Encode the input in the URL for shareability. Use URL hash + compression:

- For short inputs (< 2KB): `#data=base64encodedDER`
- For long inputs: `#data=` with zlib-compressed base64 (use `pako` or `CompressionStream` API)
- When a user pastes and parses, update the URL hash automatically
- Loading the page with a `#data=` hash auto-populates the textarea and parses

Add a "Copy permalink" button that copies the full URL.

Also support `?pem=URL` query param to fetch PEM from a URL (useful for linking from external tools). Fetch client-side via the existing SVG proxy to avoid CORS.

Sample certs: Add 3-4 buttons below the textarea that load example certs:

- "Sample VMC" — a BIMI VMC certificate
- "Sample CMC" — a BIMI CMC certificate
- "Sample Let's Encrypt" — a typical webPKI cert
- Store these as base64 constants in a separate file

Navigation: Add `/tools/asn1` to the site nav (under a "Tools" section or similar, check existing nav structure).

---

### Task 6: UI review with Chrome extension — ASN.1 Explorer

Use the Chrome browser extension to take screenshots and review the ASN.1 explorer at multiple stages:

1. Certificate detail page ASN.1 tab — verify tree rendering, hex sync, node selection
2. Standalone playground — verify paste, parse, permalink generation
3. Mobile/narrow viewport — verify responsive behavior
4. Dark mode — verify readability

Check: monospace consistency, color contrast, collapsible node UX, hex highlighting accuracy, permalink round-trip (copy URL → paste in new tab → same state).

---

## Part 2: DNS Search

### Task 7: Add dns_snapshot JSONB column and GIN index

Add the JSONB column to `domain_bimi_state` for searchable DNS data.

**Files:**

- Modify: `src/lib/db/schema.ts`

**Details:**

Add to `domain_bimi_state`:

```typescript
dnsSnapshot: jsonb("dns_snapshot").$type<DnsSnapshot>(),
```

Define the `DnsSnapshot` type (export from schema.ts or a new types file):

```typescript
export interface DnsSnapshot {
  bimi: {
    raw: string | null;
    version: string | null;
    logoUrl: string | null;
    authorityUrl: string | null;
    lps: string | null;
    avp: string | null;
    declined: boolean;
    selector: string;
    orgDomainFallback: boolean;
  } | null;
  dmarc: {
    raw: string | null;
    policy: string | null;
    sp: string | null;       // subdomain policy (currently not stored!)
    pct: number | null;
    rua: string | null;      // aggregate report URI
    ruf: string | null;      // forensic report URI
    adkim: string | null;    // DKIM alignment mode
    aspf: string | null;     // SPF alignment mode
    validForBimi: boolean;
  } | null;
  svg: {
    found: boolean;
    sizeBytes: number | null;
    contentType: string | null;
    tinyPsValid: boolean | null;
    indicatorHash: string | null;
    validationErrors: string[] | null;
  } | null;
  certificate: {
    found: boolean;
    authorityUrl: string | null;
    certType: string | null;
    issuer: string | null;
  } | null;
  meta: {
    checkedAt: string;       // ISO 8601
    grade: string | null;
  };
}
```

Add GIN index:

```typescript
index("idx_domain_bimi_dns_snapshot").using("gin", table.dnsSnapshot),
```

Run `bun run db:generate` to create the migration.

---

### Task 8: Populate dns_snapshot in validation and backfill flows

Update the code paths that write to `domain_bimi_state` to also build and store the `dns_snapshot` JSONB.

**Files:**

- Modify: `src/workers/modes/backfill-bimi-dns.ts`
- Modify: `src/app/api/certificates/[id]/bimi-check/route.ts` (if it writes to domain_bimi_state)
- Create: `src/lib/bimi/dns-snapshot.ts` — shared builder function

**Details:**

Create `buildDnsSnapshot()` that takes the parsed BIMI record, DMARC record, SVG result, and cert result and returns a `DnsSnapshot` object. Use this in both the backfill worker and any API route that upserts domain_bimi_state.

For DMARC: enhance the existing `lookupDMARC` to also extract `sp`, `rua`, `ruf`, `adkim`, `aspf` from the raw record. These are currently not parsed — add them to `DMARCRecord` interface in `dmarc.ts`.

Write a one-shot backfill script that populates `dns_snapshot` from existing flat columns for domains that already have data. This can be a new worker mode or a standalone script.

---

### Task 9: Create DNS search API endpoint

**Files:**

- Create: `src/app/api/domains/search/route.ts`

**Details:**

GET endpoint accepting query params:

- `q` — full-text search across `dns_snapshot::text` (ILIKE)
- `filter` — JSON-encoded array of predicates: `[{"path": "dmarc.policy", "op": "eq", "value": "none"}]`
- `page`, `limit` — pagination (default limit 50)
- `sort` — sort field (default: `lastChecked` desc)

Supported operators: `eq`, `neq`, `contains`, `gt`, `lt`, `exists`, `not_exists`

Path resolution: `dmarc.policy` → `dns_snapshot->'dmarc'->>'policy'`

Response shape:

```json
{
  "domains": [{ "domain": "...", "dnsSnapshot": {...}, "lastChecked": "...", "grade": "..." }],
  "total": 1234,
  "page": 1,
  "totalPages": 25
}
```

Security: validate and sanitize all filter paths against an allowlist of known `DnsSnapshot` paths. No arbitrary JSONB path traversal.

---

### Task 10: Create /domains search page

**Files:**

- Create: `src/app/domains/page.tsx`
- Create: `src/app/domains/domain-search.tsx` (client component)

**Details:**

Layout:

- Top: Search bar for full-text search (searches raw DNS records)
- Below search: Filter chips / query builder
  - Dropdown: field (dmarc.policy, bimi.logoUrl, svg.tinyPsValid, certificate.certType, etc.)
  - Dropdown: operator (equals, contains, exists, etc.)
  - Input: value
  - "Add filter" button, chips for active filters with X to remove
- Results: table with columns: Domain, BIMI Grade, DMARC Policy, Has Logo, Has Cert, Last Checked
- Click domain → expand inline or link to detail

**Permalink:** ALL state in URL search params:

- `?q=digicert` — text search
- `?f=dmarc.policy:eq:none,bimi.logoUrl:exists` — filters as comma-separated triplets
- `?page=2&sort=domain` — pagination and sort
- Every filter change updates the URL. Copy URL = share exact query.

Add "Copy link" button next to the search bar.

Preset queries as quick-access buttons:

- "No DMARC" — `f=dmarc.policy:not_exists`
- "BIMI without cert" — `f=bimi.logoUrl:exists,certificate.found:eq:false`
- "Expired certs" — shows domains where cert is found but expired
- "Invalid SVG" — `f=svg.tinyPsValid:eq:false`

Navigation: Add `/domains` to site nav.

---

### Task 11: Domain detail page (or expand existing)

**Files:**

- Create: `src/app/domains/[domain]/page.tsx`
- Create: `src/app/domains/[domain]/domain-detail.tsx`

**Details:**

When clicking a domain in search results, show full DNS state:

- Raw BIMI TXT record (monospace, syntax highlighted)
- Raw DMARC TXT record (monospace, syntax highlighted)
- Parsed fields in a key-value table
- SVG preview (if available) with validation status
- Certificate info (if found) with link to cert detail page
- Grade breakdown

**Permalink:** `/domains/example.com` — clean URL, shareable.

"Re-check now" button that triggers a live validation and updates the snapshot.

---

### Task 12: UI review with Chrome extension — DNS Search

Use Chrome browser extension to review:

1. Search page — verify filter builder UX, result rendering, pagination
2. Permalink round-trip — add filters, copy URL, open in new tab, verify same state
3. Domain detail page — verify DNS record display, cert links
4. Preset queries — verify they produce correct results
5. Empty states — no results, no filters, loading states

---

## Integration & Polish

### Task 13: Navigation and cross-linking

**Files:**

- Modify: site navigation component (find existing nav)

**Details:**

- Add "Tools" section to nav with `/tools/asn1`
- Add "Domains" to main nav linking to `/domains`
- Certificate detail page: link SANs to `/domains/[domain]`
- Domain detail page: link certificates to `/certificates/[id]`
- ASN.1 playground: "View this cert's full record" link when input matches a known cert fingerprint

---

### Task 14: Final comprehensive UI review

Full review of both features with Chrome extension:

1. Navigate the full user journey: Dashboard → Certificate → ASN.1 tab → click extension OID → copy permalink → open in new tab
2. Dashboard → Domains → search → filter → domain detail → cert link → ASN.1 tab
3. Standalone ASN.1 playground → paste cert → explore → share link
4. All at narrow viewport (mobile)
5. All in dark mode
6. Performance: large cert ASN.1 parsing time, large domain search result rendering
