import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BimiCheckItem } from "@/lib/bimi/types";

interface NextStepsProps {
  checks: BimiCheckItem[];
  overallValid: boolean;
}

interface ActionGroup {
  owner: string;
  actions: { label: string; guidance: string }[];
}

// Maps check IDs to responsible parties and plain-English guidance
const CHECK_GUIDANCE: Record<string, { owner: string; guidance: string }> = {
  "bimi-dns": {
    owner: "DNS Administrator",
    guidance: "Add a BIMI DNS TXT record pointing to your logo and certificate URLs.",
  },
  "dmarc-policy": {
    owner: "IT / Email Security",
    guidance: 'Update your DMARC policy to "quarantine" or "reject" with pct=100.',
  },
  "cert-chain": {
    owner: "Certificate Authority",
    guidance: "Fix certificate chain issues. Contact your CA for a correctly chained certificate file.",
  },
  "ca-trust": {
    owner: "Certificate Authority",
    guidance: "Get a VMC or CMC from an authorized CA (DigiCert, Entrust, GlobalSign, Sectigo, or SSL.com).",
  },
  "cert-expiry": {
    owner: "Certificate Authority",
    guidance: "Renew your expired BIMI certificate with your CA.",
  },
  "svg-match": {
    owner: "Web / Design Team",
    guidance: "Re-upload the exact SVG that was submitted during certificate issuance.",
  },
  "caa-issuevmc": {
    owner: "DNS Administrator",
    guidance:
      'Add a CAA record with the issuevmc property tag to explicitly authorize CAs for VMC issuance (e.g. 0 issuevmc "digicert.com").',
  },
  "caa-issuer-mismatch": {
    owner: "DNS Administrator",
    guidance:
      "Your certificate issuer is not listed in your domain's CAA issuevmc records. Update CAA records or obtain a certificate from an authorized CA.",
  },
};

// SVG-related check IDs use dynamic suffixes, so match by prefix
function getSvgGuidance(check: BimiCheckItem): { owner: string; guidance: string } | null {
  if (!check.id.startsWith("svg-err") && !check.id.startsWith("svg-warn") && check.id !== "svg-schema") {
    return null;
  }
  return {
    owner: "Design Team",
    guidance: check.remediation || "Fix SVG issues to comply with the SVG Tiny PS profile required by BIMI.",
  };
}

function getGuidanceForCheck(check: BimiCheckItem): { owner: string; guidance: string; label: string } | null {
  // Try static map first
  const staticGuidance = CHECK_GUIDANCE[check.id];
  if (staticGuidance) {
    return { ...staticGuidance, label: check.label };
  }

  // Try SVG pattern
  const svgGuidance = getSvgGuidance(check);
  if (svgGuidance) {
    return { ...svgGuidance, label: check.label };
  }

  // Fallback for any other failing check with remediation text
  if (check.remediation) {
    return { owner: "Technical Team", guidance: check.remediation, label: check.label };
  }

  return null;
}

export function NextSteps({ checks, overallValid }: NextStepsProps) {
  if (overallValid) {
    return (
      <Card className="border-emerald-200 dark:border-emerald-800">
        <CardContent>
          <div className="flex items-start gap-3">
            <span className="text-emerald-600 dark:text-emerald-400 text-lg font-bold mt-0.5">&#x2713;</span>
            <div>
              <p className="font-medium text-sm">Everything looks good</p>
              <p className="text-sm text-muted-foreground mt-1">
                This domain&apos;s BIMI setup passes all required checks. Email clients that support BIMI should display
                the brand logo alongside messages from this domain.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const failingChecks = checks.filter((c) => c.status === "fail" || c.status === "warn");

  if (failingChecks.length === 0) return null;

  // Group by responsible party
  const groupMap = new Map<string, { label: string; guidance: string }[]>();

  for (const check of failingChecks) {
    const info = getGuidanceForCheck(check);
    if (!info) continue;

    const existing = groupMap.get(info.owner) || [];
    // Avoid duplicate guidance text within the same group
    if (!existing.some((a) => a.guidance === info.guidance)) {
      existing.push({ label: info.label, guidance: info.guidance });
    }
    groupMap.set(info.owner, existing);
  }

  const groups: ActionGroup[] = Array.from(groupMap.entries()).map(([owner, actions]) => ({ owner, actions }));

  if (groups.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Next Steps</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map((group) => (
          <div key={group.owner}>
            <Badge variant="secondary" className="text-xs mb-2">
              {group.owner}
            </Badge>
            <ul className="space-y-2">
              {group.actions.map((action, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-muted-foreground mt-0.5 shrink-0">&#x2022;</span>
                  <span>{action.guidance}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
