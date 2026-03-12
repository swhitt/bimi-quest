// Single source of truth for OID → human-readable name resolution.
//
// Two tiers:
//   OID_NAMES         – compact labels (ASN.1 tree, CT log viewer, general use)
//   OID_DISPLAY_NAMES – verbose labels where space allows (extension decoder UI)
//
// Consumers should call resolveOidName / resolveOidDisplayName rather than
// reaching into the maps directly.

// ── Canonical OID name map ──────────────────────────────────────────

export const OID_NAMES: Record<string, string> = {
  // ── X.509 v3 Extensions (RFC 5280 §4.2) ──
  "2.5.29.9": "Subject Directory Attributes",
  "2.5.29.14": "Subject Key Identifier",
  "2.5.29.15": "Key Usage",
  "2.5.29.17": "Subject Alternative Name",
  "2.5.29.18": "Issuer Alternative Name",
  "2.5.29.19": "Basic Constraints",
  "2.5.29.20": "CRL Number",
  "2.5.29.21": "Reason Code",
  "2.5.29.23": "Hold Instruction Code",
  "2.5.29.24": "Invalidity Date",
  "2.5.29.27": "Delta CRL Indicator",
  "2.5.29.28": "Issuing Distribution Point",
  "2.5.29.29": "Certificate Issuer",
  "2.5.29.30": "Name Constraints",
  "2.5.29.31": "CRL Distribution Points",
  "2.5.29.32": "Certificate Policies",
  "2.5.29.32.0": "Any Policy",
  "2.5.29.33": "Policy Mappings",
  "2.5.29.35": "Authority Key Identifier",
  "2.5.29.36": "Policy Constraints",
  "2.5.29.37": "Extended Key Usage",
  "2.5.29.37.0": "Any Extended Key Usage",
  "2.5.29.46": "Freshest CRL",
  "2.5.29.54": "Inhibit Any Policy",

  // ── Authority / Subject Information Access ──
  "1.3.6.1.5.5.7.1.1": "Authority Information Access",
  "1.3.6.1.5.5.7.1.11": "Subject Information Access",
  "1.3.6.1.5.5.7.48.1": "OCSP",
  "1.3.6.1.5.5.7.48.2": "CA Issuers",
  "1.3.6.1.5.5.7.48.3": "Time Stamping",
  "1.3.6.1.5.5.7.48.5": "CA Repository",

  // ── Logotype / BIMI (RFC 3709) ──
  "1.3.6.1.5.5.7.1.12": "Logotype (BIMI)",

  // ── Certificate Transparency (RFC 6962) ──
  "1.3.6.1.4.1.11129.2.4.2": "CT Precert SCTs",
  "1.3.6.1.4.1.11129.2.4.3": "CT Precert Poison",
  "1.3.6.1.4.1.11129.2.4.4": "CT Precert Signer",
  "1.3.6.1.4.1.11129.2.4.5": "CT Precert Signing Cert",

  // ── Extended Key Usage (RFC 5280 §4.2.1.12) ──
  "1.3.6.1.5.5.7.3.1": "serverAuth",
  "1.3.6.1.5.5.7.3.2": "clientAuth",
  "1.3.6.1.5.5.7.3.3": "codeSigning",
  "1.3.6.1.5.5.7.3.4": "emailProtection",
  "1.3.6.1.5.5.7.3.5": "ipsecEndSystem",
  "1.3.6.1.5.5.7.3.6": "ipsecTunnel",
  "1.3.6.1.5.5.7.3.7": "ipsecUser",
  "1.3.6.1.5.5.7.3.8": "timeStamping",
  "1.3.6.1.5.5.7.3.9": "OCSPSigning",
  "1.3.6.1.5.5.7.3.17": "ipsecIKE",
  "1.3.6.1.5.5.7.3.31": "BIMI",
  "1.3.6.1.5.5.7.3.36": "documentSigning",
  "1.3.6.1.4.1.311.10.3.12": "documentSigning (Microsoft)",
  "1.3.6.1.4.1.311.20.2.2": "smartcardLogon",

  // ── DN Attributes (X.520) ──
  "2.5.4.3": "Common Name",
  "2.5.4.4": "Surname",
  "2.5.4.5": "Serial Number",
  "2.5.4.6": "Country",
  "2.5.4.7": "Locality",
  "2.5.4.8": "State/Province",
  "2.5.4.9": "Street Address",
  "2.5.4.10": "Organization",
  "2.5.4.11": "Organizational Unit",
  "2.5.4.12": "Title",
  "2.5.4.13": "Description",
  "2.5.4.15": "Business Category",
  "2.5.4.17": "Postal Code",
  "2.5.4.42": "Given Name",
  "2.5.4.46": "DN Qualifier",
  "2.5.4.65": "Pseudonym",
  "2.5.4.97": "Organization Identifier",

  // ── EV Jurisdiction (Microsoft) ──
  "1.3.6.1.4.1.311.60.2.1.1": "Jurisdiction Locality",
  "1.3.6.1.4.1.311.60.2.1.2": "Jurisdiction State",
  "1.3.6.1.4.1.311.60.2.1.3": "Jurisdiction Country",

  // ── Signature Algorithms ──
  "1.2.840.113549.1.1.1": "RSA",
  "1.2.840.113549.1.1.2": "MD2 with RSA",
  "1.2.840.113549.1.1.4": "MD5 with RSA",
  "1.2.840.113549.1.1.5": "SHA-1 with RSA",
  "1.2.840.113549.1.1.7": "RSAES-OAEP",
  "1.2.840.113549.1.1.10": "RSASSA-PSS",
  "1.2.840.113549.1.1.11": "SHA-256 with RSA",
  "1.2.840.113549.1.1.12": "SHA-384 with RSA",
  "1.2.840.113549.1.1.13": "SHA-512 with RSA",
  "1.2.840.10045.2.1": "EC Public Key",
  "1.2.840.10045.4.3.1": "ECDSA with SHA-224",
  "1.2.840.10045.4.3.2": "ECDSA with SHA-256",
  "1.2.840.10045.4.3.3": "ECDSA with SHA-384",
  "1.2.840.10045.4.3.4": "ECDSA with SHA-512",
  "1.3.101.112": "Ed25519",
  "1.3.101.113": "Ed448",

  // ── Named Curves ──
  "1.2.840.10045.3.1.7": "P-256 (secp256r1)",
  "1.3.132.0.34": "P-384 (secp384r1)",
  "1.3.132.0.35": "P-521 (secp521r1)",
  "1.3.101.110": "X25519",
  "1.3.101.111": "X448",

  // ── Hash Algorithms ──
  "1.3.14.3.2.26": "SHA-1",
  "2.16.840.1.101.3.4.2.1": "SHA-256",
  "2.16.840.1.101.3.4.2.2": "SHA-384",
  "2.16.840.1.101.3.4.2.3": "SHA-512",
  "2.16.840.1.101.3.4.2.4": "SHA-224",
  "2.16.840.1.101.3.4.2.8": "SHA3-256",
  "2.16.840.1.101.3.4.2.9": "SHA3-384",
  "2.16.840.1.101.3.4.2.10": "SHA3-512",
  "1.2.840.113549.2.5": "MD5",

  // ── CA/Browser Forum ──
  "2.23.140.1.1": "CA/Browser Forum EV",
  "2.23.140.1.2.1": "CA/Browser Forum DV",
  "2.23.140.1.2.2": "CA/Browser Forum OV",
  "2.23.140.1.2.3": "CA/Browser Forum IV",
  "2.23.140.1.31": "CA/Browser Forum Onion EV",

  // ── DigiCert ──
  "2.16.840.1.114412.1.1": "DigiCert OV",
  "2.16.840.1.114412.1.2": "DigiCert DV",
  "2.16.840.1.114412.2.1": "DigiCert EV",
  "2.16.840.1.114412.0.2.5": "DigiCert VMC",

  // ── Entrust ──
  "2.16.840.1.114028.10.1.2": "Entrust EV",
  "2.16.840.1.114028.10.1.11": "Entrust VMC (Gov Mark)",
  "2.16.840.1.114028.10.1.100": "Entrust VMC",

  // ── GlobalSign ──
  "1.3.6.1.4.1.4146.1.1": "GlobalSign DV",
  "1.3.6.1.4.1.4146.1.10": "GlobalSign OV",
  "1.3.6.1.4.1.4146.1.95": "GlobalSign VMC",

  // ── Sectigo / Comodo ──
  "1.3.6.1.4.1.6449.1.2.1.5.1": "Sectigo DV",
  "1.3.6.1.4.1.6449.1.2.1.3.2": "Sectigo OV",
  "1.3.6.1.4.1.6449.1.2.1.1.1": "Sectigo EV",

  // ── Let's Encrypt ──
  "1.3.6.1.4.1.44947.1.1.1": "Let's Encrypt DV",

  // ── BIMI Group (PEN 53087) ──
  "1.3.6.1.4.1.53087.1.1": "BIMI General Policy",
  "1.3.6.1.4.1.53087.1.2": "BIMI Trademark Office",
  "1.3.6.1.4.1.53087.1.3": "BIMI Trademark Country",
  "1.3.6.1.4.1.53087.1.4": "BIMI Trademark ID",
  "1.3.6.1.4.1.53087.1.5": "BIMI LEI",
  "1.3.6.1.4.1.53087.1.6": "BIMI Word Mark",
  "1.3.6.1.4.1.53087.1.13": "BIMI Mark Type",
  "1.3.6.1.4.1.53087.3.2": "BIMI Statute Country",
  "1.3.6.1.4.1.53087.3.3": "BIMI Statute State",
  "1.3.6.1.4.1.53087.3.4": "BIMI Statute Locality",
  "1.3.6.1.4.1.53087.3.5": "BIMI Statute Citation",
  "1.3.6.1.4.1.53087.3.6": "BIMI Statute URL",
  "1.3.6.1.4.1.53087.4.1": "BIMI Pilot ID",
  "1.3.6.1.4.1.53087.5.1": "BIMI Prior Use Source",

  // ── PKCS ──
  "1.2.840.113549.1.7.1": "PKCS#7 Data",
  "1.2.840.113549.1.7.2": "PKCS#7 Signed Data",
  "1.2.840.113549.1.9.1": "Email Address",
  "1.2.840.113549.1.9.3": "Content Type",
  "1.2.840.113549.1.9.4": "Message Digest",
  "1.2.840.113549.1.9.5": "Signing Time",
  "1.2.840.113549.1.9.15": "S/MIME Capabilities",

  // ── ETSI Qualified Certificates ──
  "1.3.6.1.5.5.7.1.3": "QC Statements",
  "0.4.0.1862.1.1": "QC Compliance",
  "0.4.0.1862.1.4": "QC SSCD",
  "0.4.0.1862.1.6": "QC Type",

  // ── Microsoft Authenticode ──
  "1.3.6.1.4.1.311.2.1.21": "MS Individual Code Signing",
  "1.3.6.1.4.1.311.2.1.22": "MS Commercial Code Signing",
  "1.3.6.1.4.1.311.3.3.1": "MS Timestamp Signing",

  // ── Adobe ──
  "1.2.840.113583.1.1.9.1": "Adobe PDF Signing",
};

// ── Verbose display names ───────────────────────────────────────────
// Override OID_NAMES with longer descriptions where the extension
// decoder UI has room for a full label.

export const OID_DISPLAY_NAMES: Record<string, string> = {
  // EKU verbose forms
  "1.3.6.1.5.5.7.3.1": "TLS Server Authentication",
  "1.3.6.1.5.5.7.3.2": "TLS Client Authentication",
  "1.3.6.1.5.5.7.3.3": "Code Signing",
  "1.3.6.1.5.5.7.3.4": "Email Protection",
  "1.3.6.1.5.5.7.3.5": "IPsec End System",
  "1.3.6.1.5.5.7.3.6": "IPsec Tunnel",
  "1.3.6.1.5.5.7.3.7": "IPsec User",
  "1.3.6.1.5.5.7.3.8": "Time Stamping",
  "1.3.6.1.5.5.7.3.9": "OCSP Signing",
  "1.3.6.1.5.5.7.3.31": "Brand Indicator for Message Identification (BIMI)",
  "1.3.6.1.5.5.7.3.36": "Document Signing",

  // CA policies verbose forms
  "2.23.140.1.1": "CA/Browser Forum EV Guidelines",
  "2.16.840.1.114412.2.1": "DigiCert EV Policy",
  "2.16.840.1.114412.0.2.5": "DigiCert VMC Policy",
  "2.16.840.1.114028.10.1.11": "Entrust VMC Government Mark Policy",
  "2.16.840.1.114028.10.1.100": "Entrust VMC Policy",
  "1.3.6.1.4.1.4146.1.95": "GlobalSign VMC Policy",

  // BIMI Group verbose forms
  "1.3.6.1.4.1.53087.1.1": "BIMI Mark Certificate General Policy",
  "1.3.6.1.4.1.53087.1.2": "BIMI Trademark Office Name",
  "1.3.6.1.4.1.53087.1.3": "BIMI Trademark Country/Region",
  "1.3.6.1.4.1.53087.1.4": "BIMI Trademark Identifier",
  "1.3.6.1.4.1.53087.1.5": "BIMI Legal Entity Identifier (LEI)",
  "1.3.6.1.4.1.53087.3.3": "BIMI Statute State/Province",
  "1.3.6.1.4.1.53087.4.1": "BIMI Pilot Identifier (sunset 2025-03-15)",
  "1.3.6.1.4.1.53087.5.1": "BIMI Prior Use Mark Source URL",
};

// ── BIMI subject DN OIDs ────────────────────────────────────────────
// Non-standard OIDs that appear in BIMI certificate subject DNs.
// Used by the cert detail UI to extract and label these fields.

export const BIMI_SUBJECT_OIDS = [
  "1.3.6.1.4.1.53087.1.2", // Trademark Office
  "1.3.6.1.4.1.53087.1.3", // Trademark Country
  "1.3.6.1.4.1.53087.1.4", // Trademark ID
  "1.3.6.1.4.1.53087.1.5", // LEI
  "1.3.6.1.4.1.53087.1.6", // Word Mark
  "1.3.6.1.4.1.53087.1.13", // Mark Type
  "1.3.6.1.4.1.53087.3.2", // Statute Country
  "1.3.6.1.4.1.53087.3.3", // Statute State
  "1.3.6.1.4.1.53087.3.4", // Statute Locality
  "1.3.6.1.4.1.53087.3.5", // Statute Citation
  "1.3.6.1.4.1.53087.3.6", // Statute URL
  "1.3.6.1.4.1.53087.5.1", // Prior Use Source
] as const;

// ── EV subject DN OIDs ──────────────────────────────────────────────
// Non-standard OIDs from the EV Guidelines that appear in subject DNs
// of EV-validated BIMI certificates.

export const EV_SUBJECT_OIDS = [
  "1.3.6.1.4.1.311.60.2.1.1", // Jurisdiction Locality
  "1.3.6.1.4.1.311.60.2.1.2", // Jurisdiction State
  "1.3.6.1.4.1.311.60.2.1.3", // Jurisdiction Country
  "2.5.4.15", // Business Category
  "2.5.4.5", // Serial Number
  "2.5.4.9", // Street Address
  "2.5.4.17", // Postal Code
] as const;

// ── Resolution helpers ──────────────────────────────────────────────

/** Resolve OID to compact name (ASN.1 tree, CT log viewer). */
export function resolveOidName(oid: string): string {
  return OID_NAMES[oid] ?? oid;
}

/** Resolve OID to verbose display name (extension decoder, cert detail panel).
 *  Falls back to OID_NAMES, then raw dotted notation. */
export function resolveOidDisplayName(oid: string): string {
  return OID_DISPLAY_NAMES[oid] ?? OID_NAMES[oid] ?? oid;
}
