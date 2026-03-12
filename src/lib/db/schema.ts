import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ExtensionEntry } from "@/lib/ct/parser";

/**
 * Extension values in the JSON column may be either:
 * - The current `ExtensionEntry` format: `{ v: string; c: boolean }`
 * - The legacy string format: a plain hex string (from early ingestion runs)
 * Consumers must handle both via type narrowing (see `getExtHex` in revocation.ts).
 */
export type ExtensionJsonValue = Record<string, ExtensionEntry | string>;

export const certificates = pgTable(
  "certificates",
  {
    id: serial("id").primaryKey(),
    fingerprintSha256: text("fingerprint_sha256").unique().notNull(),
    serialNumber: text("serial_number").notNull(),
    notBefore: timestamp("not_before", { withTimezone: true }).notNull(),
    notAfter: timestamp("not_after", { withTimezone: true }).notNull(),
    subjectDn: text("subject_dn").notNull(),
    subjectCn: text("subject_cn"),
    subjectOrg: text("subject_org"),
    subjectOrgSlug: text("subject_org_slug"),
    subjectCountry: text("subject_country"),
    subjectState: text("subject_state"),
    subjectLocality: text("subject_locality"),
    issuerDn: text("issuer_dn").notNull(),
    issuerCn: text("issuer_cn"),
    issuerOrg: text("issuer_org"),
    rootCaOrg: text("root_ca_org"),
    sanList: text("san_list").array().notNull().default([]),
    markType: text("mark_type"),
    certType: text("cert_type").$type<"VMC" | "CMC">(),
    logotypeSvgHash: text("logotype_svg_hash"),
    logotypeSvg: text("logotype_svg"),
    rawPem: text("raw_pem").notNull(),
    isPrecert: boolean("is_precert").default(false),
    ctLogTimestamp: timestamp("ct_log_timestamp", { withTimezone: true }),
    ctLogIndex: bigint("ct_log_index", { mode: "number" }),
    ctLogName: text("ct_log_name").default("gorgon"),
    extensionsJson: jsonb("extensions_json").$type<ExtensionJsonValue>(),
    crtshId: bigint("crtsh_id", { mode: "number" }),
    notabilityScore: integer("notability_score"),
    notabilityReason: text("notability_reason"),
    companyDescription: text("company_description"),
    industry: text("industry"),
    // 1-10 color richness score computed from SVG color extraction (pure regex, no LLM)
    logoColorRichness: integer("logo_color_richness"),
    // 1-10 visual quality score from multimodal LLM (Gemini Flash-Lite)
    logoQualityScore: integer("logo_quality_score"),
    logoQualityReason: text("logo_quality_reason"),
    // Pre-computed tile background hint ("light" or "dark") for thumbnail rendering
    logoTileBg: text("logo_tile_bg"),
    // Perceptual dHash of the rendered SVG, invariant to XML formatting/padding/zoom
    logotypeVisualHash: text("logotype_visual_hash"),
    // True when all SANs point to known test/demo domains (CA testing infrastructure)
    isTest: boolean("is_test").default(false),
    // True when a precert has been superseded by its matching final certificate
    isSuperseded: boolean("is_superseded").default(false),
    // How the cert was discovered: "ct-gorgon" (CT log scan), "validation" (user-initiated lookup), etc.
    discoverySource: text("discovery_source").default("ct-gorgon"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    // TODO: Drizzle ORM (pg) does not support $onUpdate; callers must include
    // `updatedAt: sql`now()`` in .set({}) calls, or a DB trigger should be added.
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_certificates_serial_number").on(table.serialNumber),
    index("idx_certificates_not_before").on(table.notBefore),
    index("idx_certificates_issuer_org").on(table.issuerOrg),
    index("idx_certs_issuer_notbefore").on(table.issuerOrg, table.notBefore),
    index("idx_certificates_subject_country").on(table.subjectCountry),
    index("idx_certificates_serial_precert").on(table.serialNumber, table.isPrecert),
    index("idx_certs_type_notbefore").on(table.certType, table.notBefore),
    index("idx_certs_rootca_notbefore").on(table.rootCaOrg, table.notBefore),
    index("idx_certs_type_rootca_notbefore").on(table.certType, table.rootCaOrg, table.notBefore),
    index("idx_certs_notafter_precert").on(table.notAfter, table.isPrecert),
    index("idx_certificates_san_list_gin").using("gin", table.sanList),
    index("idx_certificates_subject_org").on(table.subjectOrg),
    // Functional index for case-insensitive org lookups (LOWER() can't use the btree above)
    index("idx_certificates_subject_org_lower").using("btree", sql`LOWER(${table.subjectOrg})`),
    // Btree index for fingerprint prefix searches (LIKE 'abc%' can't use the UNIQUE constraint)
    index("idx_certificates_fingerprint_prefix").on(table.fingerprintSha256),
    index("idx_certificates_subject_org_slug").on(table.subjectOrgSlug),
    index("idx_certificates_industry").on(table.industry),
    index("idx_certificates_svg_hash").on(table.logotypeSvgHash),
    index("idx_certificates_visual_hash").on(table.logotypeVisualHash),
    // Partial index: most queries filter out superseded certs
    index("idx_certs_active_notbefore").on(table.notBefore).where(sql`${table.isSuperseded} = false`),
    index("idx_certs_notability_score").on(table.notabilityScore),
    // Partial index: backfill queries that find un-scored certs
    index("idx_certs_notability_null").on(table.id).where(sql`${table.notabilityScore} IS NULL`),
    // Composite indexes for dashboard GROUP BY queries
    index("idx_certs_org_notbefore").on(table.subjectOrg, table.notBefore),
    index("idx_certs_industry_notbefore").on(table.industry, table.notBefore),
    index("idx_certs_marktype_notbefore").on(table.markType, table.notBefore),
    // Functional index for case-insensitive serial number lookups (normalization across sources)
    index("idx_certs_serial_lower").using("btree", sql`LOWER(${table.serialNumber})`),
  ],
);

export const chainCerts = pgTable("chain_certs", {
  id: serial("id").primaryKey(),
  fingerprintSha256: text("fingerprint_sha256").unique().notNull(),
  subjectDn: text("subject_dn").notNull(),
  issuerDn: text("issuer_dn").notNull(),
  rawPem: text("raw_pem").notNull(),
  notBefore: timestamp("not_before", { withTimezone: true }),
  notAfter: timestamp("not_after", { withTimezone: true }),
});

export const certificateChainLinks = pgTable(
  "certificate_chain_links",
  {
    id: serial("id").primaryKey(),
    leafCertId: integer("leaf_cert_id")
      .notNull()
      .references(() => certificates.id),
    chainCertId: integer("chain_cert_id")
      .notNull()
      .references(() => chainCerts.id),
    chainPosition: integer("chain_position").notNull(),
  },
  (table) => [
    index("idx_chain_links_leaf_cert_id").on(table.leafCertId),
    uniqueIndex("idx_chain_links_unique").on(table.leafCertId, table.chainCertId),
  ],
);

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
    orgDomain?: string | null;
  } | null;
  dmarc: {
    raw: string | null;
    policy: string | null;
    sp: string | null;
    pct: number | null;
    rua: string | null;
    ruf: string | null;
    adkim: string | null;
    aspf: string | null;
    fo?: string | null;
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
    serialNumber?: string | null;
    subject?: string | null;
    notBefore?: string | null;
    notAfter?: string | null;
    subjectAltNames?: string[] | null;
    markType?: string | null;
    logoHashAlgorithm?: string | null;
    logoHashValue?: string | null;
  } | null;
  meta: {
    checkedAt: string;
    grade: string | null;
  };
}

export const domainBimiState = pgTable(
  "domain_bimi_state",
  {
    id: serial("id").primaryKey(),
    domain: text("domain").unique().notNull(),
    bimiRecordRaw: text("bimi_record_raw"),
    bimiVersion: text("bimi_version"),
    bimiLogoUrl: text("bimi_logo_url"),
    bimiAuthorityUrl: text("bimi_authority_url"),
    dmarcRecordRaw: text("dmarc_record_raw"),
    dmarcPolicy: text("dmarc_policy"),
    dmarcPct: integer("dmarc_pct"),
    dmarcValid: boolean("dmarc_valid"),
    svgFetched: boolean("svg_fetched").default(false),
    svgContent: text("svg_content"),
    svgContentType: text("svg_content_type"),
    svgSizeBytes: integer("svg_size_bytes"),
    svgTinyPsValid: boolean("svg_tiny_ps_valid"),
    svgValidationErrors: text("svg_validation_errors").array(),
    bimiLpsTag: text("bimi_lps_tag"),
    bimiAvpTag: text("bimi_avp_tag"),
    bimiDeclination: boolean("bimi_declination").default(false),
    bimiSelector: text("bimi_selector").default("default"),
    bimiOrgDomainFallback: boolean("bimi_org_domain_fallback").default(false),
    svgIndicatorHash: text("svg_indicator_hash"),
    svgTileBg: text("svg_tile_bg"),
    bimiGrade: text("bimi_grade"),
    dnsSnapshot: jsonb("dns_snapshot").$type<DnsSnapshot>(),
    lastChecked: timestamp("last_checked", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    // TODO: Drizzle ORM (pg) does not support $onUpdate; callers must include
    // `updatedAt: sql`now()`` in .set({}) calls, or a DB trigger should be added.
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_domain_bimi_dns_snapshot").using("gin", table.dnsSnapshot),
    index("idx_domain_bimi_last_checked").on(table.lastChecked),
    index("idx_domain_bimi_grade").on(table.bimiGrade),
    index("idx_domain_bimi_dmarc_policy").on(table.dmarcPolicy),
  ],
);

export const ogCache = pgTable("og_cache", {
  key: text("key").primaryKey(),
  png: text("png").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow(),
});

export const ctLogEntries = pgTable(
  "ct_log_entries",
  {
    index: bigint("index", { mode: "number" }).primaryKey(),
    logName: text("log_name").notNull().default("gorgon"),
    leafInput: text("leaf_input").notNull(),
    extraData: text("extra_data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_ct_entries_log_index").on(table.logName, table.index)],
);

// ---------------------------------------------------------------------------
// CA Trust Hierarchy (CCADB)
// ---------------------------------------------------------------------------

export const caCertificates = pgTable(
  "ca_certificates",
  {
    id: serial("id").primaryKey(),
    ccadbRecordId: text("ccadb_record_id"),
    certificateName: text("certificate_name").notNull(),
    recordType: text("record_type").notNull(),
    fingerprintSha256: text("fingerprint_sha256").unique().notNull(),
    parentFingerprintSha256: text("parent_fingerprint_sha256"),
    subjectKeyIdentifier: text("subject_key_identifier"),
    authorityKeyIdentifier: text("authority_key_identifier"),
    subjectDn: text("subject_dn"),
    issuerDn: text("issuer_dn"),
    caOwner: text("ca_owner").notNull(),
    subordinateCaOwner: text("subordinate_ca_owner"),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),
    revocationStatus: text("revocation_status"),
    appleStatus: text("apple_status"),
    chromeStatus: text("chrome_status"),
    microsoftStatus: text("microsoft_status"),
    mozillaStatus: text("mozilla_status"),
    derivedTrustBits: text("derived_trust_bits"),
    technicallyConstrained: boolean("technically_constrained").default(false),
    evOids: text("ev_oids"),
    auditorName: text("auditor_name"),
    standardAuditUrl: text("standard_audit_url"),
    crlUrls: text("crl_urls"),
    cpCpsUrl: text("cp_cps_url"),
    rawPem: text("raw_pem"),
    crossSignGroupId: text("cross_sign_group_id"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_ca_certs_parent_fp").on(table.parentFingerprintSha256),
    index("idx_ca_certs_ski").on(table.subjectKeyIdentifier),
    index("idx_ca_certs_ca_owner").on(table.caOwner),
    index("idx_ca_certs_record_type").on(table.recordType),
    index("idx_ca_certs_cross_sign_group").on(table.crossSignGroupId),
  ],
);

export const caCrossSigns = pgTable(
  "ca_cross_signs",
  {
    id: serial("id").primaryKey(),
    certIdA: integer("cert_id_a")
      .notNull()
      .references(() => caCertificates.id),
    certIdB: integer("cert_id_b")
      .notNull()
      .references(() => caCertificates.id),
    sharedSki: text("shared_ski").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_ca_cross_signs_a").on(table.certIdA), index("idx_ca_cross_signs_b").on(table.certIdB)],
);

export const caSyncCursors = pgTable("ca_sync_cursors", {
  id: serial("id").primaryKey(),
  sourceName: text("source_name").unique().notNull(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  recordCount: integer("record_count"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// DNS Record Change Tracking (polymorphic: BIMI + DMARC)
// ---------------------------------------------------------------------------

export const dnsRecordChanges = pgTable(
  "dns_record_changes",
  {
    id: serial("id").primaryKey(),
    domain: text("domain")
      .notNull()
      .references(() => domainBimiState.domain),
    recordType: text("record_type").notNull(), // 'bimi' | 'dmarc'
    changeType: text("change_type").notNull(), // semantic event
    previousRaw: text("previous_raw"),
    newRaw: text("new_raw"),
    previousRecord: jsonb("previous_record").$type<Record<string, string>>(),
    newRecord: jsonb("new_record").$type<Record<string, string>>(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_dns_changes_detected_at").on(table.detectedAt),
    index("idx_dns_changes_domain_detected").on(table.domain, table.detectedAt),
  ],
);

// Legacy table — kept for migration; new code uses dnsRecordChanges
export const dmarcPolicyChanges = pgTable(
  "dmarc_policy_changes",
  {
    id: serial("id").primaryKey(),
    domain: text("domain")
      .notNull()
      .references(() => domainBimiState.domain),
    previousPolicy: text("previous_policy"),
    newPolicy: text("new_policy").notNull(),
    previousPct: integer("previous_pct"),
    newPct: integer("new_pct"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_dmarc_changes_domain").on(table.domain),
    index("idx_dmarc_changes_detected_at").on(table.detectedAt),
  ],
);

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

export const ingestionCursors = pgTable("ingestion_cursors", {
  id: serial("id").primaryKey(),
  logName: text("log_name").unique().notNull(),
  lastIndex: bigint("last_index", { mode: "number" }).notNull().default(0),
  treeSize: bigint("tree_size", { mode: "number" }),
  lastRun: timestamp("last_run", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Domain Change Alerting
// ---------------------------------------------------------------------------

export const domainWatches = pgTable(
  "domain_watches",
  {
    id: serial("id").primaryKey(),
    domain: text("domain").notNull(),
    webhookUrl: text("webhook_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [uniqueIndex("idx_domain_watches_domain_webhook").on(table.domain, table.webhookUrl)],
);
