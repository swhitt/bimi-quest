/**
 * CA display name normalization.
 *
 * Maps raw issuer_org / root_ca_org values from certificate DNs to
 * canonical display names. The raw values are preserved in the DB;
 * this layer is purely for presentation.
 */

// Canonical display names for root CAs.
// Sectigo is intentionally absent: they always chain to SSL.com roots for BIMI.
const ROOT_CA_DISPLAY: Record<string, string> = {
  "DigiCert": "DigiCert",
  "DigiCert, Inc.": "DigiCert",
  "Entrust": "Entrust",
  "Entrust, Inc.": "Entrust",
  "GlobalSign": "GlobalSign",
  "GlobalSign nv-sa": "GlobalSign",
  "SSL Corporation": "SSL.com",
};

// Canonical display names for issuing CAs (intermediates)
const ISSUER_DISPLAY: Record<string, string> = {
  "DigiCert": "DigiCert",
  "DigiCert, Inc.": "DigiCert",
  "Entrust": "Entrust",
  "Entrust, Inc.": "Entrust",
  "GlobalSign nv-sa": "GlobalSign",
  "SSL Corporation": "SSL.com",
  "Sectigo Limited": "Sectigo",
};

export function displayRootCa(rootCaOrg: string | null): string {
  if (!rootCaOrg) return "Unknown";
  return ROOT_CA_DISPLAY[rootCaOrg] || rootCaOrg;
}

export function displayIssuerOrg(issuerOrg: string | null): string {
  if (!issuerOrg) return "Unknown";
  return ISSUER_DISPLAY[issuerOrg] || issuerOrg;
}

/**
 * Returns the issuer display name with root CA context when they differ.
 * e.g. "Sectigo (via SSL.com)" or just "DigiCert" when root = issuer.
 */
export function displayIssuerWithRoot(
  issuerOrg: string | null,
  rootCaOrg: string | null
): string {
  const issuer = displayIssuerOrg(issuerOrg);
  const root = displayRootCa(rootCaOrg);
  if (issuer === root || !rootCaOrg) return issuer;
  return `${issuer} (via ${root})`;
}

/**
 * Normalize an issuer_org value extracted from a cert DN.
 * Use this during ingestion to keep stored values consistent.
 */
export function normalizeIssuerOrg(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\\$/, "").trim();
  if (cleaned === "DigiCert, Inc." || cleaned === "DigiCert\\, Inc.") return "DigiCert";
  if (cleaned === "Entrust, Inc." || cleaned === "Entrust\\, Inc.") return "Entrust";
  if (cleaned === "GlobalSign" || cleaned === "GlobalSign NV-SA") return "GlobalSign nv-sa";
  return cleaned;
}
