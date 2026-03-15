"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UtcTime } from "@/components/ui/utc-time";

interface SctRow {
  id: number;
  logId: string;
  logName: string | null;
  logOperator: string | null;
  sctTimestamp: string;
  lagSeconds: number | null;
}

function formatLag(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 0) return `${Math.abs(seconds)}s before issuance`;
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

export function CertificateSCTs({ scts }: { scts: SctRow[] }) {
  if (scts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Signed Certificate Timestamps</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {scts.length} SCT{scts.length !== 1 ? "s" : ""}
            </Badge>
            {scts.length === 1 && (
              <Badge variant="destructive" className="text-xs">
                Single-log transparency
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4">Log Name</th>
                <th className="pb-2 pr-4">Operator</th>
                <th className="pb-2 pr-4">SCT Timestamp</th>
                <th className="pb-2">Lag</th>
              </tr>
            </thead>
            <tbody>
              {scts.map((sct) => (
                <tr key={sct.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    {sct.logName || (
                      <span className="text-muted-foreground font-mono text-xs">{sct.logId.substring(0, 16)}...</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{sct.logOperator || "Unknown"}</td>
                  <td className="py-2 pr-4">
                    <UtcTime date={sct.sctTimestamp} />
                  </td>
                  <td className="py-2 font-mono text-xs">{formatLag(sct.lagSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
