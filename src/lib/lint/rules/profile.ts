import { BasicConstraintsExtension, KeyUsageFlags, KeyUsagesExtension } from "@peculiar/x509";
import type { LintRule } from "../types";

const MAX_VALIDITY_MS = 825 * 24 * 60 * 60 * 1000; // 825 days

const basicConstraints: LintRule = (cert) => {
  const ext = cert.getExtension(BasicConstraintsExtension);
  if (!ext) {
    return {
      rule: "e_bimi_basic_constraints",
      severity: "error",
      source: "RFC5280",
      citation: "RFC 5280 §4.2.1.9",
      title: "Basic Constraints cA must be false",
      status: "pass",
    };
  }
  return {
    rule: "e_bimi_basic_constraints",
    severity: "error",
    source: "RFC5280",
    citation: "RFC 5280 §4.2.1.9",
    title: "Basic Constraints cA must be false",
    status: ext.ca ? "fail" : "pass",
    detail: ext.ca ? "Basic Constraints cA is true; end-entity certs must not be CAs" : undefined,
  };
};

const noNameConstraints: LintRule = (cert) => {
  const ext = cert.extensions.find((e) => e.type === "2.5.29.30");
  return {
    rule: "e_bimi_no_name_constraints",
    severity: "error",
    source: "MCR",
    citation: "MCR §7.1.2.7",
    title: "Name Constraints must not be present",
    status: ext ? "fail" : "pass",
    detail: ext ? "Name Constraints extension is present but must not be" : undefined,
  };
};

const keyUsage: LintRule = (cert) => {
  const ext = cert.getExtension(KeyUsagesExtension);
  if (!ext) {
    return {
      rule: "e_bimi_key_usage",
      severity: "error",
      source: "MCR",
      citation: "MCR §7.1.2.7",
      title: "Key Usage must include digitalSignature",
      status: "fail",
      detail: "Key Usage extension is missing",
    };
  }
  const hasDigitalSig = (ext.usages & KeyUsageFlags.digitalSignature) !== 0;
  return {
    rule: "e_bimi_key_usage",
    severity: "error",
    source: "MCR",
    citation: "MCR §7.1.2.7",
    title: "Key Usage must include digitalSignature",
    status: hasDigitalSig ? "pass" : "fail",
    detail: hasDigitalSig ? undefined : "digitalSignature bit is not set in Key Usage",
  };
};

const validityPeriod: LintRule = (cert) => {
  const duration = cert.notAfter.getTime() - cert.notBefore.getTime();
  const days = Math.round(duration / (24 * 60 * 60 * 1000));
  return {
    rule: "e_bimi_validity_period",
    severity: "error",
    source: "MCR",
    citation: "MCR §6.3.2",
    title: "Validity period must not exceed 825 days",
    status: duration <= MAX_VALIDITY_MS ? "pass" : "fail",
    detail: duration > MAX_VALIDITY_MS ? `Validity period is ${days} days (max 825)` : undefined,
  };
};

export const rules: LintRule[] = [basicConstraints, noNameConstraints, keyUsage, validityPeriod];
