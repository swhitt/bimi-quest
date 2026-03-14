# BIMI Certificate Linter — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a ZLint-inspired certificate linter that validates BIMI VMC/CMC certificates against MCR v1.7, RFC 3709, RFC 5280, and CABF requirements, exposed as a pure function, API endpoint, standalone page, and integrated into the existing validation checklist.

**Architecture:** Pure lint engine (`lintBimiCert`) with rules as plain functions. No side effects in the core. Three entry points: integrated `ValidationChecklist` tab, standalone `/lint` page, and `POST /api/lint` JSON API. Rules organized by category in `src/lib/lint/rules/`.

**Tech Stack:** TypeScript, `@peculiar/x509`, Next.js App Router, vitest, existing SVG validation (`svg.ts`, `svg-rng.ts`), Drizzle ORM for fingerprint lookups, shadcn/ui components.

**Design doc:** `docs/plans/2026-03-14-bimi-cert-linter-design.md`

---

## Task 1: Types and Lint Engine Scaffold

**Files:**

- Create: `src/lib/lint/types.ts`
- Create: `src/lib/lint/lint.ts`
- Test: `src/lib/lint/__tests__/lint.test.ts`

**Step 1: Create the type definitions**

Create `src/lib/lint/types.ts`:

```typescript
import type { X509Certificate } from "@peculiar/x509";

export type LintSeverity = "error" | "warning" | "notice";
export type LintSource = "MCR" | "RFC3709" | "RFC5280" | "CABF";
export type LintStatus = "pass" | "fail" | "not_applicable";

export interface LintResult {
  rule: string;
  severity: LintSeverity;
  source: LintSource;
  citation: string;
  title: string;
  status: LintStatus;
  detail?: string;
}

export type LintRule = (cert: X509Certificate, pem: string) => LintResult | LintResult[] | null;

export interface LintSummary {
  errors: number;
  warnings: number;
  notices: number;
  passed: number;
}
```

**Step 2: Create the lint orchestrator**

Create `src/lib/lint/lint.ts`:

```typescript
import { X509Certificate } from "@peculiar/x509";
import { pemToDer, toArrayBuffer } from "@/lib/pem";
import type { LintResult, LintRule, LintSummary } from "./types";
// Rules will be imported and added to this array as they are implemented
import { rules as ekuRules } from "./rules/eku";

const allRules: LintRule[] = [
  ...ekuRules,
  // ... more rule arrays added in later tasks
];

export function lintBimiCert(cert: X509Certificate, pem: string): LintResult[] {
  return allRules.flatMap((rule) => {
    const result = rule(cert, pem);
    if (!result) return [];
    return Array.isArray(result) ? result : [result];
  });
}

export function lintPem(pem: string): LintResult[] {
  const der = pemToDer(pem);
  const cert = new X509Certificate(toArrayBuffer(der));
  return lintBimiCert(cert, pem);
}

export function summarize(results: LintResult[]): LintSummary {
  let errors = 0, warnings = 0, notices = 0, passed = 0;
  for (const r of results) {
    if (r.status === "pass") { passed++; continue; }
    if (r.status === "not_applicable") continue;
    if (r.severity === "error") errors++;
    else if (r.severity === "warning") warnings++;
    else notices++;
  }
  return { errors, warnings, notices, passed };
}
```

**Step 3: Write the test**

Create `src/lib/lint/__tests__/lint.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { summarize } from "../lint";
import type { LintResult } from "../types";

describe("summarize", () => {
  it("counts by severity and status", () => {
    const results: LintResult[] = [
      { rule: "a", severity: "error", source: "MCR", citation: "", title: "", status: "pass" },
      { rule: "b", severity: "error", source: "MCR", citation: "", title: "", status: "fail" },
      { rule: "c", severity: "warning", source: "MCR", citation: "", title: "", status: "fail" },
      { rule: "d", severity: "notice", source: "MCR", citation: "", title: "", status: "fail" },
      { rule: "e", severity: "error", source: "MCR", citation: "", title: "", status: "not_applicable" },
    ];
    expect(summarize(results)).toEqual({ errors: 1, warnings: 1, notices: 1, passed: 1 });
  });
});
```

**Step 4: Run test**

Run: `bunx vitest run src/lib/lint/__tests__/lint.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/lint/types.ts src/lib/lint/lint.ts src/lib/lint/__tests__/lint.test.ts
git commit -m "feat(lint): scaffold types and lint engine"
```

---

## Task 2: EKU Rules

**Files:**

- Create: `src/lib/lint/rules/eku.ts`
- Create: `src/lib/lint/__tests__/eku.test.ts`

**Context:** The BIMI EKU OID is `1.3.6.1.5.5.7.3.31`. MCR §7.1.2.7 requires it to be the sole EKU. Use `@peculiar/x509` `ExtendedKeyUsageExtension` to read EKUs. Reference how `validate.ts` uses `cert.getExtension()`.

**Step 1: Write the rules**

Create `src/lib/lint/rules/eku.ts`:

```typescript
import { ExtendedKeyUsageExtension, type X509Certificate } from "@peculiar/x509";
import type { LintResult, LintRule } from "../types";

const BIMI_EKU = "1.3.6.1.5.5.7.3.31";

const ekuPresent: LintRule = (cert) => {
  const ext = cert.getExtension(ExtendedKeyUsageExtension);
  const has = ext?.usages.some((u) => u === BIMI_EKU) ?? false;
  return {
    rule: "e_bimi_eku_present",
    severity: "error",
    source: "MCR",
    citation: "MCR §7.1.2.7",
    title: "EKU must contain BIMI OID",
    status: has ? "pass" : "fail",
    detail: has ? undefined : `EKU does not contain ${BIMI_EKU}`,
  };
};

const ekuSingle: LintRule = (cert) => {
  const ext = cert.getExtension(ExtendedKeyUsageExtension);
  if (!ext) return { rule: "e_bimi_eku_single", severity: "error", source: "MCR", citation: "MCR §7.1.2.7", title: "EKU must contain only BIMI OID", status: "not_applicable" };
  const nonBimi = ext.usages.filter((u) => u !== BIMI_EKU);
  return {
    rule: "e_bimi_eku_single",
    severity: "error",
    source: "MCR",
    citation: "MCR §7.1.2.7",
    title: "EKU must contain only BIMI OID",
    status: nonBimi.length === 0 ? "pass" : "fail",
    detail: nonBimi.length > 0 ? `Unexpected EKU OIDs: ${nonBimi.join(", ")}` : undefined,
  };
};

export const rules: LintRule[] = [ekuPresent, ekuSingle];
```

**Step 2: Write tests**

Create `src/lib/lint/__tests__/eku.test.ts`. Tests need a real PEM to parse. Use a minimal approach: grab a known BIMI cert PEM from the DB or embed a short test fixture. For unit tests, construct `X509Certificate` from a test PEM.

The test should:

- Use a real DigiCert VMC PEM fixture (grab one from the certificates table or embed a known one)
- Verify `e_bimi_eku_present` passes for a valid VMC
- Verify `e_bimi_eku_single` passes when BIMI is the only EKU
- Create or use a non-BIMI cert (e.g., a TLS cert) and verify both rules fail

Create a shared fixtures file at `src/lib/lint/__tests__/fixtures.ts` with at least one valid BIMI cert PEM (can be extracted from the DB using drizzle studio or the CLI). This fixture file will be reused by all rule tests.

**Step 3: Run tests**

Run: `bunx vitest run src/lib/lint/__tests__/eku.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/lint/rules/eku.ts src/lib/lint/__tests__/eku.test.ts src/lib/lint/__tests__/fixtures.ts
git commit -m "feat(lint): EKU rules with tests"
```

---

## Task 3: Profile Rules (Basic Constraints, Name Constraints, Key Usage, Validity)

**Files:**

- Create: `src/lib/lint/rules/profile.ts`
- Create: `src/lib/lint/__tests__/profile.test.ts`

**Context:**

- Basic Constraints: use `cert.getExtension(BasicConstraintsExtension)` (import from `@peculiar/x509`). If present, `cA` must be false.
- Name Constraints: check `cert.extensions` for OID `2.5.29.30`. Must NOT be present.
- Key Usage: check extension OID `2.5.29.15`. digitalSignature bit must be set. Can use the raw extension bytes or `KeyUsagesExtension` from `@peculiar/x509`.
- Validity: `cert.notAfter.getTime() - cert.notBefore.getTime()` must be ≤ 825 days (71,280,000,000 ms).

**Rules to implement:**

- `e_bimi_basic_constraints` — error, RFC 5280 §4.2.1.9
- `e_bimi_no_name_constraints` — error, MCR §7.1.2.7
- `e_bimi_key_usage` — error, MCR §7.1.2.7
- `e_bimi_validity_period` — error, MCR §6.3.2

**Step 1: Write rules**

**Step 2: Write tests using fixtures from Task 2**

**Step 3: Run tests**

Run: `bunx vitest run src/lib/lint/__tests__/profile.test.ts`

**Step 4: Update `lint.ts` to import profile rules into `allRules`**

**Step 5: Commit**

```bash
git add src/lib/lint/rules/profile.ts src/lib/lint/__tests__/profile.test.ts src/lib/lint/lint.ts
git commit -m "feat(lint): profile rules (basic constraints, name constraints, key usage, validity)"
```

---

## Task 4: SCT and Pilot ID Rules

**Files:**

- Create: `src/lib/lint/rules/sct.ts`
- Create: `src/lib/lint/__tests__/sct.test.ts`

**Context:**

- SCT List: check `cert.extensions` for OID `1.3.6.1.4.1.11129.2.4.2`. Must be present.
- Pilot ID: check for OID `1.3.6.1.4.1.53087.4.1`. For certs with `notBefore` after 2025-03-15, this SHALL NOT be present. For older certs, it's `not_applicable`.

**Rules to implement:**

- `e_bimi_sct_present` — error, MCR §7.1.2.7
- `w_bimi_pilot_id_sunset` — warning, MCR §7.1.2.7

**Step 1–4: Write rules, tests, update `lint.ts`, run tests**

**Step 5: Commit**

```bash
git add src/lib/lint/rules/sct.ts src/lib/lint/__tests__/sct.test.ts src/lib/lint/lint.ts
git commit -m "feat(lint): SCT presence and pilot ID sunset rules"
```

---

## Task 5: Certificate Policy Rules

**Files:**

- Create: `src/lib/lint/rules/policy.ts`
- Create: `src/lib/lint/__tests__/policy.test.ts`

**Context:**

- Use `cert.extensions` to find OID `2.5.29.32` (Certificate Policies).
- Parse the DER to extract policy OIDs. Can reuse the DER parsing from `decode-extensions.ts` — specifically the `collectOids` / `parseDer` approach, or use the extension's raw value bytes.
- BIMI General Policy: `1.3.6.1.4.1.53087.1.1` must be present.
- CPS URL: at least one HTTP(S) URL must be present in the policy qualifiers.
- CA Policy OID: check if a known CA-specific VMC OID is present (DigiCert `2.16.840.1.114412.0.2.5`, Entrust `2.16.840.1.114028.10.1.100` / `2.16.840.1.114028.10.1.11`, GlobalSign `1.3.6.1.4.1.4146.1.95`). This is a warning-level check comparing issuer org against known OIDs.

**Rules to implement:**

- `e_bimi_general_policy` — error, MCR §7.1.6.4
- `e_bimi_cps_url_present` — error, MCR §7.1.6.4
- `w_bimi_ca_policy_oid` — warning, CABF

**Step 1–4: Write rules, tests, update `lint.ts`, run tests**

**Step 5: Commit**

```bash
git add src/lib/lint/rules/policy.ts src/lib/lint/__tests__/policy.test.ts src/lib/lint/lint.ts
git commit -m "feat(lint): certificate policy rules (general policy, CPS URL, CA OID)"
```

---

## Task 6: Mark Type and Subject DN Rules

**Files:**

- Create: `src/lib/lint/rules/mark-type.ts`
- Create: `src/lib/lint/__tests__/mark-type.test.ts`

**Context:**

- Mark type extraction: reuse `extractSubjectAttribute` from `src/lib/x509/asn1.ts` with OID `1.3.6.1.4.1.53087.1.13`.
- Valid mark types: `Registered Mark`, `Government Mark`, `Prior Use Mark`, `Modified Registered Mark`, `Pending Registration Mark` (see `deriveCertType` in `parser.ts`).
- DN field requirements per mark type (MCR §7.1.4.2):
  - VMC (Registered Mark): must have trademark OIDs (`1.3.6.1.4.1.53087.1.2` office, `1.3.6.1.4.1.53087.1.3` country, `1.3.6.1.4.1.53087.1.4` ID)
  - VMC (Government Mark): must have statute OIDs (`1.3.6.1.4.1.53087.3.2` country, etc.)
  - CMC (Prior Use Mark): must have prior use source (`1.3.6.1.4.1.53087.5.1`)
- Use `extractSubjectAttribute` to check for each required OID in the subject DN.

**Rules to implement:**

- `e_bimi_mark_type_valid` — error, MCR §7.1.4.2.2
- `e_bimi_mark_type_dn_fields` — error, MCR §7.1.4.2 (returns multiple results, one per missing field)

**Step 1–4: Write rules, tests, update `lint.ts`, run tests**

**Step 5: Commit**

```bash
git add src/lib/lint/rules/mark-type.ts src/lib/lint/__tests__/mark-type.test.ts src/lib/lint/lint.ts
git commit -m "feat(lint): mark type validation and DN field rules"
```

---

## Task 7: Logotype Extension Rules

**Files:**

- Create: `src/lib/lint/rules/logotype.ts`
- Create: `src/lib/lint/__tests__/logotype.test.ts`

**Context:**

- Logotype extension OID: `1.3.6.1.5.5.7.1.12`. Must be present.
- Reuse `extractLogotypeSvg` from `src/lib/ct/parser.ts` to get the SVG content.
- Check for `data:image/svg+xml;base64,` marker in raw extension bytes (same approach as `extractLogotypeSvg`).
- Check if the base64 payload decodes to gzipped content (first two bytes `1f 8b`).
- For SVG Tiny PS validation, call `validateSVGTinyPS` from `src/lib/bimi/svg.ts`.
- For logotype hash, check for SHA-256 OID (`2.16.840.1.101.3.4.2.1`) in the extension bytes (same regex as `extractLogotypeSvgHash` in parser.ts).

**Note:** The SVG Tiny PS validation (`validateSvgRng`) uses `xmllint-wasm` which may not be available in all test environments. For the logotype rule tests, mock or skip the RNG validation and test the structural checks (data URI presence, compression, hash algorithm). The SVG content validation can use `validateSVGTinyPS` (the non-WASM validator) which is pure JS.

**Rules to implement:**

- `e_bimi_logotype_present` — error, MCR §7.1.2.7
- `e_bimi_logotype_data_uri` — error, MCR §7.1.2.7
- `e_bimi_svg_compressed` — error, MCR §7.1.2.7
- `e_bimi_svg_tiny_ps` — error, MCR §7.1.2.7
- `w_bimi_logotype_hash_sha256` — warning, RFC 3709 §2.1

**Step 1–4: Write rules, tests, update `lint.ts`, run tests**

**Step 5: Commit**

```bash
git add src/lib/lint/rules/logotype.ts src/lib/lint/__tests__/logotype.test.ts src/lib/lint/lint.ts
git commit -m "feat(lint): logotype extension rules (data URI, compression, SVG, hash)"
```

---

## Task 8: Algorithm Rules

**Files:**

- Create: `src/lib/lint/rules/algorithm.ts`
- Create: `src/lib/lint/__tests__/algorithm.test.ts`

**Context:**

- `cert.publicKey` from `@peculiar/x509` has `algorithm` property with `name` (e.g., `RSASSA-PKCS1-v1_5`, `ECDSA`) and params.
- For RSA: check `algorithm.publicKey.algorithm.modulusLength >= 2048` or parse from the SPKI.
- For ECDSA: check the named curve is P-256 or P-384. `cert.publicKey.algorithm.namedCurve` gives this.
- MCR §6.1.5 specifies minimum key sizes.

**Rules to implement:**

- `w_bimi_rsa_key_size` — warning, MCR §6.1.5
- `w_bimi_ecdsa_curve` — warning, MCR §6.1.5

**Step 1–4: Write rules, tests, update `lint.ts`, run tests**

**Step 5: Commit**

```bash
git add src/lib/lint/rules/algorithm.ts src/lib/lint/__tests__/algorithm.test.ts src/lib/lint/lint.ts
git commit -m "feat(lint): algorithm strength rules (RSA size, ECDSA curve)"
```

---

## Task 9: BimiCheckItem Mapper

**Files:**

- Create: `src/lib/lint/to-check-items.ts`
- Create: `src/lib/lint/__tests__/to-check-items.test.ts`

**Context:**

- Maps `LintResult[]` → `BimiCheckItem[]` for the integrated `ValidationChecklist` view.
- Import `BimiCheckItem` from `@/lib/bimi/types`.
- Category is always `"spec"` (lint rules are spec checks).
- Mapping: error+fail→fail, warning+fail→warn, notice+fail→info, any+pass→pass, not_applicable→skip.
- `specRef` = `result.citation`, `detail` = `result.detail`.

**Step 1: Write the mapper**

```typescript
import type { BimiCheckItem } from "@/lib/bimi/types";
import type { LintResult } from "./types";

export function toLintCheckItems(results: LintResult[]): BimiCheckItem[] {
  return results.map((r) => ({
    id: r.rule,
    category: "spec" as const,
    label: r.title,
    status: mapStatus(r),
    summary: r.status === "pass" ? "Passed" : (r.detail ?? "Failed"),
    detail: r.detail,
    specRef: r.citation,
  }));
}

function mapStatus(r: LintResult): BimiCheckItem["status"] {
  if (r.status === "not_applicable") return "skip";
  if (r.status === "pass") return "pass";
  if (r.severity === "error") return "fail";
  if (r.severity === "warning") return "warn";
  return "info";
}
```

**Step 2: Write tests**

**Step 3: Run tests**

Run: `bunx vitest run src/lib/lint/__tests__/to-check-items.test.ts`

**Step 4: Commit**

```bash
git add src/lib/lint/to-check-items.ts src/lib/lint/__tests__/to-check-items.test.ts
git commit -m "feat(lint): LintResult to BimiCheckItem mapper"
```

---

## Task 10: Integration Test with Real Cert

**Files:**

- Modify: `src/lib/lint/__tests__/lint.test.ts`

**Context:**

- Add an integration test that runs `lintPem()` against the fixture PEM from Task 2.
- Assert that the result count matches expected (all Tier 1/2/3 rules).
- Assert specific expected results for the known cert (e.g., EKU passes, mark type is valid).
- Assert `summarize()` returns sensible counts.

**Step 1: Add integration test to `lint.test.ts`**

**Step 2: Run full test suite**

Run: `bunx vitest run src/lib/lint/`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/lib/lint/__tests__/lint.test.ts
git commit -m "test(lint): integration test with real BIMI cert"
```

---

## Task 11: API Route

**Files:**

- Create: `src/app/api/lint/route.ts`
- Create: `src/app/api/lint/__tests__/route.test.ts`

**Context:**

- `POST /api/lint` accepts JSON body with one of: `{ pem }`, `{ fingerprint }`, `{ url }`.
- For `pem`: call `lintPem(pem)` directly.
- For `fingerprint`: query `certificates` table via Drizzle (`db.select({ rawPem: certificates.rawPem }).from(certificates).where(eq(certificates.fingerprintSha256, fingerprint))`). Import `db` from `@/lib/db`, `certificates` from `@/lib/db/schema`.
- For `url`: use `safeFetch` from `@/lib/net/safe-fetch` to fetch the PEM, then lint it.
- Return `{ results, summary }`.
- Follow existing API route patterns in `src/app/api/` (e.g., `validate/route.ts`).

**Step 1: Write the route**

**Step 2: Write tests** (mock DB and fetch for fingerprint/URL paths, test PEM path directly)

**Step 3: Run tests**

Run: `bunx vitest run src/app/api/lint/`

**Step 4: Run build to verify no type errors**

Run: `bunx tsc --noEmit`

**Step 5: Commit**

```bash
git add src/app/api/lint/route.ts src/app/api/lint/__tests__/route.test.ts
git commit -m "feat(lint): POST /api/lint endpoint"
```

---

## Task 12: Standalone Lint Page

**Files:**

- Create: `src/app/lint/page.tsx`
- Create: `src/components/lint/lint-form.tsx`
- Create: `src/components/lint/lint-results.tsx`

**Context:**

- Page at `/lint`. Server component wrapper with client component for the form/results.
- `lint-form.tsx`: Three tabs (shadcn `Tabs`): "Paste PEM", "Fetch URL", "Lookup Fingerprint". Each tab has a textarea/input and a "Lint" button. Calls `POST /api/lint` with the appropriate payload.
- `lint-results.tsx`: Displays `LintResult[]` grouped by `source` (MCR, RFC 3709, RFC 5280, CABF). Each group shows a header with pass/fail counts. Each result shows status icon (reuse `STATUS_ICON` pattern from `validation-checklist.tsx`), rule ID, title, citation badge, and detail on failure.
- Follow existing component patterns: use shadcn `Card`, `Badge`, `Tabs`, `Button`, `Input`, `Textarea`.
- Show summary stats at the top (N errors, N warnings, N notices, N passed).

**Step 1: Create the results component**

**Step 2: Create the form component**

**Step 3: Create the page**

**Step 4: Run build**

Run: `bun run build`
Expected: Build succeeds

**Step 5: Manual test** — run `bun run dev`, navigate to `/lint`, paste a PEM, verify results render.

**Step 6: Commit**

```bash
git add src/app/lint/page.tsx src/components/lint/lint-form.tsx src/components/lint/lint-results.tsx
git commit -m "feat(lint): standalone /lint page with PEM, URL, and fingerprint input"
```

---

## Task 13: Integrate into Validation Checklist

**Files:**

- Modify: `src/components/bimi/validation-checklist.tsx`
- Modify: `src/lib/bimi/validate.ts` (or the page that calls it — find where `checks` are built and passed to `ValidationChecklist`)

**Context:**

- Add a third tab "Certificate Lint" to the existing `ValidationChecklist` `Tabs` component, alongside "Spec Compliance" and "Client Compatibility".
- Only show the tab when the validation result includes a certificate with a PEM (`rawPem` is not null).
- In the validation flow, when a cert is found, call `lintPem(pem)` and convert via `toLintCheckItems()`. Pass the lint check items to `ValidationChecklist` as a new prop (e.g., `lintChecks`).
- The tab shows fail/warn count badge like the other tabs.

**Step 1: Add `lintChecks` prop to `ValidationChecklist`**

**Step 2: Add the third tab rendering lint checks**

**Step 3: Wire up lint execution in the validate flow** — find where `buildChecks()` is called and add `lintPem()` + `toLintCheckItems()` nearby. Pass results through to the component.

**Step 4: Run build**

Run: `bun run build`

**Step 5: Manual test** — validate a domain with a VMC, verify the Certificate Lint tab appears with results.

**Step 6: Commit**

```bash
git add src/components/bimi/validation-checklist.tsx src/lib/bimi/validate.ts
git commit -m "feat(lint): integrate certificate lint tab into validation checklist"
```

---

## Task 14: CT Log Detail "Lint This Certificate" Link

**Files:**

- Modify: `src/components/ct-log/cert-summary.tsx` (or the cert detail page component)

**Context:**

- Add a "Lint this certificate" link/button to the certificate detail view in the CT log dashboard.
- Links to `/lint?fingerprint=<sha256>` which the lint page picks up and auto-runs.
- Update `lint-form.tsx` to read `searchParams` and auto-populate + auto-submit when a fingerprint query param is present.

**Step 1: Add the link to cert-summary.tsx**

**Step 2: Handle query params in lint-form.tsx**

**Step 3: Run build**

Run: `bun run build`

**Step 4: Commit**

```bash
git add src/components/ct-log/cert-summary.tsx src/components/lint/lint-form.tsx
git commit -m "feat(lint): add 'Lint this certificate' link from CT log detail"
```

---

## Task 15: Final Polish and Full Test Run

**Files:**

- Modify: `src/lib/lint/lint.ts` (ensure all rule imports are wired up)

**Step 1: Verify all rule files are imported in `lint.ts`**

Ensure `allRules` includes spreads from: `eku`, `profile`, `sct`, `policy`, `mark-type`, `logotype`, `algorithm`.

**Step 2: Run full lint test suite**

Run: `bunx vitest run src/lib/lint/`
Expected: All tests PASS

**Step 3: Run full project test suite**

Run: `bunx vitest run`
Expected: All tests PASS

**Step 4: Run build**

Run: `bun run build`
Expected: Build succeeds

**Step 5: Run linters**

Run: `bunx biome format --write src/lib/lint/ src/components/lint/ src/app/lint/ src/app/api/lint/`
Run: `bunx tsc --noEmit`

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(lint): BIMI certificate linter complete"
```
