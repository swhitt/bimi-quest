import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LpsLookupStep {
  step: number;
  description: string;
  dnsName: string;
  result: "found" | "not_found" | "skipped";
}

interface LpsTieredResult {
  normalizedLocalPart: string;
  steps: LpsLookupStep[];
  matchedPrefix: string | null;
}

interface LpsTraceProps {
  trace: LpsTieredResult;
}

const STATUS_STYLES: Record<string, { icon: string; className: string }> = {
  found: { icon: "\u2713", className: "text-emerald-600 dark:text-emerald-400" },
  not_found: { icon: "\u2717", className: "text-muted-foreground" },
  skipped: { icon: "\u2014", className: "text-muted-foreground" },
};

export function LpsTrace({ trace }: LpsTraceProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">LPS Tiered Discovery</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Normalized local-part:</span>
          <Badge variant="secondary" className="font-mono">
            {trace.normalizedLocalPart || "(empty)"}
          </Badge>
          {trace.matchedPrefix && (
            <>
              <span className="text-muted-foreground">Matched prefix:</span>
              <Badge variant="outline" className="font-mono">
                {trace.matchedPrefix}
              </Badge>
            </>
          )}
        </div>
        <ol className="space-y-2">
          {trace.steps.map((step) => {
            const style = STATUS_STYLES[step.result] ?? STATUS_STYLES.skipped;
            return (
              <li key={step.step} className="flex items-start gap-2 text-sm">
                <span className="text-muted-foreground shrink-0 w-5 text-right">{step.step}.</span>
                <span className={`shrink-0 ${style.className}`}>{style.icon}</span>
                <div>
                  <p>{step.description}</p>
                  <p className="text-xs text-muted-foreground font-mono">{step.dnsName}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
