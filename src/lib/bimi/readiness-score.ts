import type { DnsSnapshot } from "@/lib/db/schema";

export interface ReadinessCheck {
  label: string;
  points: number;
  maxPoints: number;
  passed: boolean;
  detail: string;
}

export type ReadinessTier = "Excellent" | "Good" | "Fair" | "Poor" | "None";

export interface ReadinessResult {
  score: number;
  maxScore: 100;
  checks: ReadinessCheck[];
  tier: ReadinessTier;
}

function tierFromScore(score: number): ReadinessTier {
  if (score >= 90) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 40) return "Fair";
  if (score >= 10) return "Poor";
  return "None";
}

/**
 * Compute a BIMI readiness score (0-100) from a DNS snapshot.
 *
 * Score components:
 *  - DMARC record exists: 10 pts
 *  - DMARC policy quarantine (10) or reject (20): up to 20 pts
 *  - DMARC pct=100 (5) or pct>=50 (2): up to 5 pts
 *  - BIMI record exists and not declined: 15 pts
 *  - SVG logo found: 10 pts
 *  - SVG Tiny PS valid: 10 pts
 *  - VMC certificate present (20) or CMC (15): up to 20 pts
 *  - Certificate not expired: 10 pts
 */
export function computeReadinessScore(snapshot: DnsSnapshot): ReadinessResult {
  const checks: ReadinessCheck[] = [];

  // 1. DMARC record exists (10 pts)
  const dmarcExists = snapshot.dmarc?.raw != null;
  checks.push({
    label: "DMARC record exists",
    points: dmarcExists ? 10 : 0,
    maxPoints: 10,
    passed: dmarcExists,
    detail: dmarcExists ? "DMARC TXT record found" : "No DMARC record",
  });

  // 2. DMARC policy strength (20 pts)
  const policy = snapshot.dmarc?.policy?.toLowerCase();
  const policyPoints = policy === "reject" ? 20 : policy === "quarantine" ? 10 : 0;
  checks.push({
    label: "DMARC policy strength",
    points: policyPoints,
    maxPoints: 20,
    passed: policyPoints > 0,
    detail: policy ? `p=${policy}` : "No policy set",
  });

  // 3. DMARC pct (5 pts)
  const pct = snapshot.dmarc?.pct;
  const pctPoints = pct === 100 || pct == null ? 5 : pct >= 50 ? 2 : 0;
  // pct defaults to 100 when omitted, so null counts as full credit
  const pctPassed = pctPoints === 5;
  checks.push({
    label: "DMARC percentage (pct)",
    points: dmarcExists ? pctPoints : 0,
    maxPoints: 5,
    passed: dmarcExists && pctPassed,
    detail: pct != null ? `pct=${pct}` : dmarcExists ? "pct not set (defaults to 100)" : "No DMARC record",
  });

  // 4. BIMI record exists and not declined (15 pts)
  const bimiExists = snapshot.bimi?.raw != null && !snapshot.bimi?.declined;
  checks.push({
    label: "BIMI record present",
    points: bimiExists ? 15 : 0,
    maxPoints: 15,
    passed: bimiExists,
    detail: snapshot.bimi?.declined
      ? "Domain has declined BIMI"
      : snapshot.bimi?.raw
        ? "BIMI TXT record found"
        : "No BIMI record",
  });

  // 5. SVG logo found (10 pts)
  const svgFound = snapshot.svg?.found ?? false;
  checks.push({
    label: "SVG logo found",
    points: svgFound ? 10 : 0,
    maxPoints: 10,
    passed: svgFound,
    detail: svgFound ? `${(snapshot.svg?.sizeBytes ?? 0).toLocaleString()} bytes` : "No SVG logo",
  });

  // 6. SVG Tiny PS valid (10 pts)
  const svgValid = snapshot.svg?.tinyPsValid ?? false;
  checks.push({
    label: "SVG Tiny PS compliant",
    points: svgValid ? 10 : 0,
    maxPoints: 10,
    passed: svgValid,
    detail: svgValid ? "Passes Tiny PS validation" : svgFound ? "SVG fails Tiny PS validation" : "No SVG to validate",
  });

  // 7. VMC/CMC certificate present (20 pts for VMC, 15 for CMC)
  const certFound = snapshot.certificate?.found ?? false;
  const certType = snapshot.certificate?.certType?.toUpperCase();
  const certPoints = certFound ? (certType === "VMC" ? 20 : 15) : 0;
  checks.push({
    label: "Certificate present",
    points: certPoints,
    maxPoints: 20,
    passed: certFound,
    detail: certFound
      ? `${certType ?? "Certificate"} from ${snapshot.certificate?.issuer ?? "unknown"}`
      : "No certificate",
  });

  // 8. Certificate not expired (10 pts)
  const notAfter = snapshot.certificate?.notAfter;
  const certNotExpired = certFound && notAfter != null && new Date(notAfter) > new Date();
  checks.push({
    label: "Certificate not expired",
    points: certNotExpired ? 10 : 0,
    maxPoints: 10,
    passed: certNotExpired,
    detail: certNotExpired
      ? `Expires ${notAfter}`
      : certFound
        ? notAfter
          ? "Certificate has expired"
          : "Expiry date unknown"
        : "No certificate",
  });

  const score = checks.reduce((sum, c) => sum + c.points, 0);

  return {
    score,
    maxScore: 100,
    checks,
    tier: tierFromScore(score),
  };
}
