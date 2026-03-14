import { ExtendedKeyUsageExtension } from "@peculiar/x509";
import type { LintRule } from "../types";

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
  if (!ext) {
    return {
      rule: "e_bimi_eku_single",
      severity: "error",
      source: "MCR",
      citation: "MCR §7.1.2.7",
      title: "EKU must contain only BIMI OID",
      status: "not_applicable",
    };
  }
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
