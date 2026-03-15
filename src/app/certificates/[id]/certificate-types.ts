/** Extension value — either plain text or an object with decoded value and criticality flag. */
export type ExtensionValue = string | { v: string; c: boolean };

/** Narrow prop types for each sub-component — documents exactly which fields are consumed. */
export type CertificateHeaderData = Pick<CertData, "certificate" | "pairedCert" | "sanCertCounts">;
export type CertificateBimiData = Pick<CertData, "certificate" | "bimiStates">;
export type CertificateExtensionsData = Pick<CertData, "certificate" | "pairedCert" | "sanCertCounts">;
export type CertificateChainData = Pick<CertData, "certificate" | "chain">;

export interface CertData {
  certificate: {
    id: number;
    fingerprintSha256: string;
    serialNumber: string;
    isPrecert: boolean;
    notBefore: string;
    notAfter: string;
    subjectDn: string;
    subjectCn: string | null;
    subjectOrg: string | null;
    subjectCountry: string | null;
    subjectState: string | null;
    subjectLocality: string | null;
    issuerDn: string;
    issuerCn: string | null;
    issuerOrg: string | null;
    sanList: string[];
    markType: string | null;
    certType: string | null;
    logotypeSvgHash: string | null;
    rawPem: string;
    ctLogTimestamp: string | null;
    ctLogIndex: string | null;
    extensionsJson: Record<string, ExtensionValue> | null;
    crtshId: string | null;
    notabilityScore: number | null;
    notabilityReason: string | null;
    companyDescription: string | null;
    industry: string | null;
  };
  pairedCert: {
    id: number;
    isPrecert: boolean;
    fingerprintSha256: string;
    ctLogIndex: string | null;
    ctLogTimestamp: string | null;
    extensionsJson: Record<string, ExtensionValue> | null;
  } | null;
  chain: {
    id: number;
    chainPosition: number;
    fingerprintSha256: string;
    subjectDn: string;
    issuerDn: string;
    notBefore: string | null;
    notAfter: string | null;
    rawPem: string;
    serialNumber: string | null;
    subjectOrg: string | null;
    issuerOrg: string | null;
  }[];
  bimiStates: {
    domain: string;
    bimiRecordRaw: string | null;
    bimiLogoUrl: string | null;
    dmarcPolicy: string | null;
    dmarcValid: boolean | null;
    svgTinyPsValid: boolean | null;
  }[];
  sanCertCounts: Record<string, number>;
  scts: {
    id: number;
    logId: string;
    logName: string | null;
    logOperator: string | null;
    sctTimestamp: string;
    lagSeconds: number | null;
  }[];
}

export interface BimiCheckResult {
  certSvgValidation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } | null;
  certValidity: {
    isExpired: boolean;
    isNotYetValid: boolean;
    daysRemaining: number;
    markType: string | null;
    certType: string | null;
  };
  certSvgHash: string | null;
  certSvgSizeBytes: number | null;
  domains: {
    domain: string;
    bimiRecord: string | null;
    bimiRecordCount: number | null;
    dmarcRecord: string | null;
    dmarcRecordCount: number | null;
    logoUrl: string | null;
    authorityUrl: string | null;
    dmarcPolicy: string | null;
    dmarcValid: boolean | null;
    webSvgFound: boolean;
    webSvgValidation: {
      valid: boolean;
      errors: string[];
      warnings: string[];
    } | null;
    webSvgSizeBytes: number | null;
    svgMatch: boolean | null;
    webSvgSource: string | null;
  }[];
}

export interface RevocationCheck {
  url: string;
  status: "good" | "revoked" | "unknown" | "error";
  thisUpdate?: string;
  nextUpdate?: string;
  errorMessage?: string;
}

export interface RevocationResult {
  ocsp: RevocationCheck | null;
  crl:
    | (Omit<RevocationCheck, "status"> & {
        status: "good" | "revoked" | "error";
      })
    | null;
}

export function formatSerial(serial: string): string {
  const hex = serial.replace(/^0x/i, "").toLowerCase();
  return hex.match(/.{1,2}/g)?.join(":") || serial;
}
