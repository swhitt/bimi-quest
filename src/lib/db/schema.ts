import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

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
    subjectCountry: text("subject_country"),
    subjectState: text("subject_state"),
    subjectLocality: text("subject_locality"),
    issuerDn: text("issuer_dn").notNull(),
    issuerCn: text("issuer_cn"),
    issuerOrg: text("issuer_org"),
    rootCaOrg: text("root_ca_org"),
    sanList: text("san_list").array().notNull().default([]),
    markType: text("mark_type"),
    certType: text("cert_type"),
    logotypeSvgHash: text("logotype_svg_hash"),
    logotypeSvg: text("logotype_svg"),
    rawPem: text("raw_pem").notNull(),
    isPrecert: boolean("is_precert").default(false),
    ctLogTimestamp: timestamp("ct_log_timestamp", { withTimezone: true }),
    ctLogIndex: bigint("ct_log_index", { mode: "number" }),
    ctLogName: text("ct_log_name").default("gorgon"),
    extensionsJson: jsonb("extensions_json"),
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
    // Perceptual dHash of the rendered SVG, invariant to XML formatting/padding/zoom
    logotypeVisualHash: text("logotype_visual_hash"),
    // True when a precert has been superseded by its matching final certificate
    isSuperseded: boolean("is_superseded").default(false),
    // How the cert was discovered: "ct-gorgon" (CT log scan), "validation" (user-initiated lookup), etc.
    discoverySource: text("discovery_source").default("ct-gorgon"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
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
    index("idx_certificates_svg_hash").on(table.logotypeSvgHash),
    index("idx_certificates_visual_hash").on(table.logotypeVisualHash),
    // Partial index: most queries filter out superseded certs
    index("idx_certs_active_notbefore").on(table.notBefore).where(sql`${table.isSuperseded} = false`),
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
  (table) => [index("idx_chain_links_leaf_cert_id").on(table.leafCertId)],
);

export const domainBimiState = pgTable("domain_bimi_state", {
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
  bimiGrade: text("bimi_grade"),
  lastChecked: timestamp("last_checked", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const ogCache = pgTable("og_cache", {
  key: text("key").primaryKey(),
  png: text("png").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow(),
});

export const ingestionCursors = pgTable("ingestion_cursors", {
  id: serial("id").primaryKey(),
  logName: text("log_name").unique().notNull(),
  lastIndex: bigint("last_index", { mode: "number" }).notNull().default(0),
  treeSize: bigint("tree_size", { mode: "number" }),
  lastRun: timestamp("last_run", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
