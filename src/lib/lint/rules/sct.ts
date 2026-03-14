import type { LintRule } from "../types";

const SCT_OID = "1.3.6.1.4.1.11129.2.4.2";
const PILOT_ID_OID = "1.3.6.1.4.1.53087.4.1";
const PILOT_SUNSET_DATE = new Date("2025-03-15T00:00:00Z");

const sctPresent: LintRule = (cert) => {
  const ext = cert.extensions.find((e) => e.type === SCT_OID);
  return {
    rule: "e_bimi_sct_present",
    severity: "error",
    source: "MCR",
    citation: "MCR §7.1.2.7",
    title: "SCT List extension must be present",
    status: ext ? "pass" : "fail",
    detail: ext ? undefined : "SCT List extension is missing",
  };
};

const pilotIdSunset: LintRule = (cert) => {
  if (cert.notBefore < PILOT_SUNSET_DATE) {
    return {
      rule: "w_bimi_pilot_id_sunset",
      severity: "warning",
      source: "MCR",
      citation: "MCR §7.1.2.7",
      title: "Pilot ID should not be present after 2025-03-15",
      status: "not_applicable",
      detail: "Certificate notBefore is before sunset date",
    };
  }
  const ext = cert.extensions.find((e) => e.type === PILOT_ID_OID);
  return {
    rule: "w_bimi_pilot_id_sunset",
    severity: "warning",
    source: "MCR",
    citation: "MCR §7.1.2.7",
    title: "Pilot ID should not be present after 2025-03-15",
    status: ext ? "fail" : "pass",
    detail: ext ? "Pilot ID extension is present but should not be after sunset date" : undefined,
  };
};

export const rules: LintRule[] = [sctPresent, pilotIdSunset];
