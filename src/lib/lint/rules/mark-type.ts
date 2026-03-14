import { extractSubjectAttribute } from "@/lib/x509/asn1";
import type { LintResult, LintRule } from "../types";

const MARK_TYPE_OID = "1.3.6.1.4.1.53087.1.13";

const VALID_MARK_TYPES = new Set([
  "Registered Mark",
  "Government Mark",
  "Prior Use Mark",
  "Modified Registered Mark",
  "Pending Registration Mark",
]);

const VMC_REGISTERED_MARK_OIDS: Record<string, string> = {
  "1.3.6.1.4.1.53087.1.2": "Trademark Office",
  "1.3.6.1.4.1.53087.1.3": "Trademark Country",
  "1.3.6.1.4.1.53087.1.4": "Trademark Registration ID",
};

const VMC_GOVERNMENT_MARK_OIDS: Record<string, string> = {
  "1.3.6.1.4.1.53087.3.2": "Government Country",
};

const CMC_PRIOR_USE_OIDS: Record<string, string> = {
  "1.3.6.1.4.1.53087.5.1": "Prior Use Source",
};

const markTypeValid: LintRule = (cert) => {
  const markType = extractSubjectAttribute(cert, MARK_TYPE_OID);
  if (!markType) {
    return {
      rule: "e_bimi_mark_type_valid",
      severity: "error",
      source: "MCR",
      citation: "MCR §7.1.4.2.2",
      title: "Mark type must be present and valid",
      status: "fail",
      detail: "Mark type attribute not found in subject DN",
    };
  }
  return {
    rule: "e_bimi_mark_type_valid",
    severity: "error",
    source: "MCR",
    citation: "MCR §7.1.4.2.2",
    title: "Mark type must be present and valid",
    status: VALID_MARK_TYPES.has(markType) ? "pass" : "fail",
    detail: VALID_MARK_TYPES.has(markType) ? undefined : `Unknown mark type: "${markType}"`,
  };
};

function getRequiredOids(markType: string): Record<string, string> | null {
  switch (markType) {
    case "Registered Mark":
      return VMC_REGISTERED_MARK_OIDS;
    case "Government Mark":
      return VMC_GOVERNMENT_MARK_OIDS;
    case "Prior Use Mark":
      return CMC_PRIOR_USE_OIDS;
    default:
      return null;
  }
}

const markTypeDnFields: LintRule = (cert) => {
  const markType = extractSubjectAttribute(cert, MARK_TYPE_OID);
  if (!markType || !VALID_MARK_TYPES.has(markType)) {
    return {
      rule: "e_bimi_mark_type_dn_fields",
      severity: "error",
      source: "MCR",
      citation: "MCR §7.1.4.2",
      title: "Required DN fields for mark type",
      status: "not_applicable",
    };
  }

  const requiredOids = getRequiredOids(markType);
  if (!requiredOids) {
    return {
      rule: "e_bimi_mark_type_dn_fields",
      severity: "error",
      source: "MCR",
      citation: "MCR §7.1.4.2",
      title: "Required DN fields for mark type",
      status: "not_applicable",
    };
  }

  const results: LintResult[] = [];
  for (const [oid, label] of Object.entries(requiredOids)) {
    const value = extractSubjectAttribute(cert, oid);
    const suffix = label.toLowerCase().replace(/\s+/g, "_");
    results.push({
      rule: `e_bimi_mark_type_dn_${suffix}`,
      severity: "error",
      source: "MCR",
      citation: "MCR §7.1.4.2",
      title: `${label} must be present for ${markType}`,
      status: value ? "pass" : "fail",
      detail: value ? undefined : `Missing ${label} (OID ${oid}) in subject DN`,
    });
  }
  return results;
};

export const rules: LintRule[] = [markTypeValid, markTypeDnFields];
