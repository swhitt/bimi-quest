import type { X509Certificate } from "@peculiar/x509";
import { CertificatePolicyExtension } from "@peculiar/x509";
import type { LintRule } from "../types";

const BIMI_GENERAL_POLICY = "1.3.6.1.4.1.53087.1.1";
const CERT_POLICIES_OID = "2.5.29.32";

const KNOWN_CA_POLICY_OIDS: Record<string, string> = {
  "2.16.840.1.114412.0.2.5": "DigiCert",
  "2.16.840.1.114028.10.1.100": "Entrust",
  "2.16.840.1.114028.10.1.11": "Entrust",
  "1.3.6.1.4.1.4146.1.95": "GlobalSign",
};

function getPolicyExtension(cert: X509Certificate): CertificatePolicyExtension | undefined {
  return cert.getExtension(CertificatePolicyExtension) ?? undefined;
}

const generalPolicy: LintRule = (cert) => {
  const ext = getPolicyExtension(cert);
  if (!ext) {
    return {
      rule: "e_bimi_general_policy",
      severity: "error",
      source: "MCR",
      citation: "MCR §7.1.6.4",
      title: "BIMI General Policy OID must be present",
      status: "fail",
      detail: "Certificate Policies extension is missing",
    };
  }
  const has = ext.policies.includes(BIMI_GENERAL_POLICY);
  return {
    rule: "e_bimi_general_policy",
    severity: "error",
    source: "MCR",
    citation: "MCR §7.1.6.4",
    title: "BIMI General Policy OID must be present",
    status: has ? "pass" : "fail",
    detail: has ? undefined : `Policy OID ${BIMI_GENERAL_POLICY} not found in certificate policies`,
  };
};

const cpsUrlPresent: LintRule = (cert) => {
  const rawExt = cert.extensions.find((e) => e.type === CERT_POLICIES_OID);
  if (!rawExt) {
    return {
      rule: "e_bimi_cps_url_present",
      severity: "error",
      source: "MCR",
      citation: "MCR §7.1.6.4",
      title: "CPS URL must be present in certificate policies",
      status: "not_applicable",
    };
  }
  // Scan raw extension value for HTTP(S) URLs
  const raw = new Uint8Array(rawExt.value);
  const text = new TextDecoder("ascii", { fatal: false }).decode(raw);
  const hasUrl = /https?:\/\/[^\x00-\x1f]+/.test(text);
  return {
    rule: "e_bimi_cps_url_present",
    severity: "error",
    source: "MCR",
    citation: "MCR §7.1.6.4",
    title: "CPS URL must be present in certificate policies",
    status: hasUrl ? "pass" : "fail",
    detail: hasUrl ? undefined : "No CPS URL found in certificate policies",
  };
};

const caPolicyOid: LintRule = (cert) => {
  const ext = getPolicyExtension(cert);
  if (!ext) {
    return {
      rule: "w_bimi_ca_policy_oid",
      severity: "warning",
      source: "CABF",
      citation: "CABF",
      title: "CA-specific policy OID should be present",
      status: "not_applicable",
    };
  }
  const found = ext.policies.find((p) => p in KNOWN_CA_POLICY_OIDS);
  return {
    rule: "w_bimi_ca_policy_oid",
    severity: "warning",
    source: "CABF",
    citation: "CABF",
    title: "CA-specific policy OID should be present",
    status: found ? "pass" : "fail",
    detail: found
      ? `Found ${KNOWN_CA_POLICY_OIDS[found]} policy OID: ${found}`
      : "No known CA-specific VMC policy OID found",
  };
};

export const rules: LintRule[] = [generalPolicy, cpsUrlPresent, caPolicyOid];
