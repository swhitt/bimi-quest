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
      title: "Certificate must not be a CA",
      status: "pass",
      detail: "BasicConstraints extension absent (correct for end-entity certificates)",
    };
  }
  return {
    rule: "e_bimi_basic_constraints",
    severity: "error",
    source: "RFC5280",
    citation: "RFC 5280 §4.2.1.9",
    title: "Certificate must not be a CA",
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

const keyUsageCritical: LintRule = (cert) => {
  const ext = cert.getExtension(KeyUsagesExtension);
  if (!ext) {
    return {
      rule: "e_bimi_key_usage_critical",
      severity: "error",
      source: "RFC5280",
      citation: "RFC 5280 §4.2.1.3",
      title: "Key Usage extension must be critical",
      status: "not_applicable",
    };
  }
  return {
    rule: "e_bimi_key_usage_critical",
    severity: "error",
    source: "RFC5280",
    citation: "RFC 5280 §4.2.1.3",
    title: "Key Usage extension must be critical",
    status: ext.critical ? "pass" : "fail",
    detail: ext.critical ? undefined : "Key Usage extension is not marked critical (must be per RFC 5280)",
  };
};

const serialEntropy: LintRule = (cert) => {
  const serialHex = cert.serialNumber;
  // Serial number should have at least 64 bits of entropy per CABF BR §7.1
  // A serial with >= 8 bytes of actual value (ignoring leading zeros) satisfies this
  const trimmed = serialHex.replace(/^0+/, "");
  // Each hex digit = 4 bits. 64 bits = 16 hex digits minimum
  const hasEntropy = trimmed.length >= 16;
  return {
    rule: "w_bimi_serial_entropy",
    severity: "warning",
    source: "CABF",
    citation: "CABF",
    title: "Serial number should contain at least 64 bits of entropy",
    status: hasEntropy ? "pass" : "fail",
    detail: hasEntropy
      ? undefined
      : `Serial number has ${trimmed.length * 4} bits (${trimmed.length} hex digits); CABF requires at least 64 bits of entropy`,
  };
};

export const rules: LintRule[] = [
  basicConstraints,
  noNameConstraints,
  keyUsage,
  keyUsageCritical,
  validityPeriod,
  serialEntropy,
];
