"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";

interface RecentCert {
  id: number;
  serialNumber: string;
  subjectCn: string | null;
  subjectOrg: string | null;
  issuerOrg: string | null;
  certType: string | null;
  notBefore: string;
  subjectCountry: string | null;
  sanList: string[];
  logotypeSvg: string | null;
  isPrecert: boolean | null;
}

interface RecentCertsProps {
  certs: RecentCert[];
}

export function RecentCerts({ certs }: RecentCertsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Issuances</CardTitle>
      </CardHeader>
      <CardContent>
        {certs.length > 0 ? (
          <div className="space-y-3">
            {certs.map((cert) => (
              <Link
                key={cert.id}
                href={`/certificates/${cert.id}`}
                className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-secondary/50"
              >
                <div className="flex items-center gap-3">
                  {cert.logotypeSvg ? (
                    <div
                      className="h-8 w-8 shrink-0 rounded border bg-white p-0.5 overflow-hidden [&>svg]:w-full [&>svg]:h-full"
                      dangerouslySetInnerHTML={{ __html: cert.logotypeSvg }}
                    />
                  ) : (
                    <div className="h-8 w-8 shrink-0 rounded border bg-muted" />
                  )}
                  <div className="space-y-1">
                    <div className="font-medium">
                      {cert.subjectOrg || cert.subjectCn || cert.sanList[0] || "Unknown"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {cert.sanList[0] || cert.subjectCn}
                      {cert.subjectCountry && ` · ${cert.subjectCountry}`}
                      {" · "}
                      <span className="font-mono italic text-xs" title={cert.serialNumber}>
                        ({cert.serialNumber.slice(0, 8)})
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{cert.certType || "BIMI"}</Badge>
                  {cert.isPrecert && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 text-amber-600 dark:text-amber-400" title="Precertificate only (final certificate not yet logged)">
                      Precert
                    </Badge>
                  )}
                  <Badge variant="secondary">{cert.issuerOrg || "Unknown CA"}</Badge>
                  <span
                    className="text-xs text-muted-foreground"
                    title={format(new Date(cert.notBefore), "PPP pp")}
                  >
                    {formatDistanceToNow(new Date(cert.notBefore), { addSuffix: true })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">
            No certificates found. Run the ingestion worker to populate data.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
