# BIMI Certificate Linter — Design

## Overview

A ZLint-inspired linter for BIMI Mark Certificates (VMC/CMC). Validates certificates against the MCR v1.7 spec, RFC 3709, RFC 5280, and CA/Browser Forum requirements. No equivalent tool exists in the PKI ecosystem.

## Architecture

Pure function at the core: `lintBimiCert(cert, pem) → LintResult[]`. No side effects, no DB, no network. Exposed in three contexts:

1. **Integrated** — new "Certificate Lint" tab in `ValidationChecklist` on the domain validate page
2. **Standalone** — `/lint` page with PEM paste, URL fetch, and fingerprint lookup
3. **API** — `POST /api/lint` returns structured JSON for automation

### File Structure

```
src/lib/lint/
  types.ts          — LintResult, LintSeverity, LintSource, LintRule
  lint.ts           — lintBimiCert() orchestrator
  to-check-items.ts — LintResult[] → BimiCheckItem[] mapper
  rules/
    eku.ts          — EKU checks
    logotype.ts     — Logotype extension + embedded SVG
    policy.ts       — Certificate Policies checks
    profile.ts      — Basic Constraints, Name Constraints, Key Usage, validity
    sct.ts          — SCT presence, Pilot ID sunset
    mark-type.ts    — Mark type + DN field checks per type
    algorithm.ts    — Signature/key strength
  __tests__/        — vitest tests per rule file + integration
```

### Integration Points

- `@peculiar/x509` `X509Certificate` — same object the parser already produces
- `svg.ts` + `svg-rng.ts` — reused for embedded SVG Tiny PS validation
- `oid-names.ts` — OID resolution
- `parser.ts` — `extractLogotypeSvg()`, `deriveCertType()`, etc.
- Existing `buildCertChecks()` in `validate.ts` unchanged; linter is additive

## Data Model

```typescript
type LintSeverity = "error" | "warning" | "notice";
type LintSource = "MCR" | "RFC3709" | "RFC5280" | "CABF";
type LintStatus = "pass" | "fail" | "not_applicable";

interface LintResult {
  rule: string;           // "e_bimi_eku_single", "w_bimi_pilot_id_present"
  severity: LintSeverity;
  source: LintSource;
  citation: string;       // "MCR §7.1.2.7"
  title: string;          // "EKU must contain only BIMI"
  status: LintStatus;
  detail?: string;        // explanation on failure
}

// Rules are plain functions — no base class, no decorators
type LintRule = (cert: X509Certificate, pem: string) => LintResult | LintResult[] | null;
```

### Severity Mapping to BimiCheckItem

| LintSeverity | LintStatus       | BimiCheckItem.status |
|-------------|------------------|---------------------|
| error       | fail             | fail                |
| warning     | fail             | warn                |
| notice      | fail             | info                |
| any         | pass             | pass                |
| any         | not_applicable   | skip                |

## Lint Rules

### Tier 1 — Core MCR Profile

| Rule ID | Sev | Citation | Check |
|---|---|---|---|
| `e_bimi_eku_present` | error | MCR §7.1.2.7 | EKU contains `1.3.6.1.5.5.7.3.31` |
| `e_bimi_eku_single` | error | MCR §7.1.2.7 | EKU has no other KeyPurposeIds |
| `e_bimi_logotype_present` | error | MCR §7.1.2.7 | Logotype extension exists |
| `e_bimi_mark_type_valid` | error | MCR §7.1.4.2.2 | Mark type is one of 5 known values |
| `e_bimi_general_policy` | error | MCR §7.1.6.4 | Certificate Policies includes `1.3.6.1.4.1.53087.1.1` |
| `e_bimi_basic_constraints` | error | RFC 5280 §4.2.1.9 | `cA` is false or absent |
| `e_bimi_no_name_constraints` | error | MCR §7.1.2.7 | Name Constraints not present |
| `e_bimi_sct_present` | error | MCR §7.1.2.7 | SCT list extension present |
| `e_bimi_key_usage` | error | MCR §7.1.2.7 | Key Usage includes digitalSignature |
| `e_bimi_validity_period` | error | MCR §6.3.2 | notAfter − notBefore ≤ 825 days |
| `w_bimi_pilot_id_sunset` | warning | MCR §7.1.2.7 | Pilot ID absent for certs issued after 2025-03-15 |

### Tier 2 — Logotype Deep-Dive

| Rule ID | Sev | Citation | Check |
|---|---|---|---|
| `e_bimi_logotype_data_uri` | error | MCR §7.1.2.7 | SVG embedded as `data:` URI |
| `e_bimi_svg_tiny_ps` | error | MCR §7.1.2.7 | SVG passes Tiny PS schema validation |
| `w_bimi_logotype_hash_sha256` | warning | RFC 3709 §2.1 | Hash uses SHA-256 |
| `e_bimi_svg_compressed` | error | MCR §7.1.2.7 | SVG is gzip-compressed |

### Tier 3 — Policy/CA Checks

| Rule ID | Sev | Citation | Check |
|---|---|---|---|
| `e_bimi_cps_url_present` | error | MCR §7.1.6.4 | CPS URL in Certificate Policies |
| `w_bimi_ca_policy_oid` | warning | CABF | CA-specific policy OID matches known issuer |
| `e_bimi_mark_type_dn_fields` | error | MCR §7.1.4.2 | Required subject DN OIDs per mark type |
| `w_bimi_rsa_key_size` | warning | MCR §6.1.5 | RSA ≥ 2048 bits |
| `w_bimi_ecdsa_curve` | warning | MCR §6.1.5 | ECDSA uses P-256 or P-384 |

## API

### `POST /api/lint`

Accepts one of:

- `{ pem: string }` — raw PEM text
- `{ fingerprint: string }` — SHA-256 fingerprint, looks up cert in DB
- `{ url: string }` — fetches PEM from URL (reuses `safeFetch`)

Returns:

```json
{
  "results": [ ...LintResult[] ],
  "summary": { "errors": 0, "warnings": 1, "notices": 0, "passed": 19 }
}
```

## Pages

### `/lint` — Standalone Linter

Three input tabs: Paste PEM / Fetch URL / Lookup Fingerprint.

Results rendered in a ZLint-style table grouped by source (MCR, RFC 3709, RFC 5280, CABF) with pass/fail/warn counts in the header.

CT log detail pages link here via "Lint this certificate" with fingerprint.

### Domain Validate Page — Integrated View

New "Certificate Lint" tab in `ValidationChecklist` alongside "Spec Compliance" and "Client Compatibility". Populated via `toLintCheckItems()` mapper. Only shown when a VMC/CMC certificate is present.

## Testing

vitest tests in `src/lib/lint/__tests__/`:

- One test file per rule file (`eku.test.ts`, `logotype.test.ts`, etc.)
- `lint.test.ts` — integration test for full orchestrator
- `to-check-items.test.ts` — mapper coverage
- `src/app/api/lint/__tests__/route.test.ts` — API route tests

Test fixtures: real BIMI certs from CT log ingestion + hand-crafted malformed certs for edge cases.

## Non-Goals

- No persistent storage of lint results (stateless, on-demand)
- No custom rule DSL or plugin system
- No lint history or cert version diffing
- No batch/bulk lint API
