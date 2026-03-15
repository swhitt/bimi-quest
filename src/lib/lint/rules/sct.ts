import type { LintRule } from "../types";

const SCT_OID = "1.3.6.1.4.1.11129.2.4.2";
const PILOT_ID_OID = "1.3.6.1.4.1.53087.4.1";

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

const pilotIdAbsent: LintRule = (cert) => {
  const ext = cert.extensions.find((e) => e.type === PILOT_ID_OID);
  return {
    rule: "e_bimi_pilot_id_absent",
    severity: "error",
    source: "MCR",
    citation: "MCR §7.1.2.7",
    title: "Pilot ID extension must not be present",
    status: ext ? "fail" : "pass",
    detail: ext ? "Pilot ID extension is present but the pilot program has ended" : undefined,
  };
};

export const rules: LintRule[] = [sctPresent, pilotIdAbsent];
