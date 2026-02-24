"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface RecentCert {
  id: number;
  subjectCn: string | null;
  subjectOrg: string | null;
  issuerOrg: string | null;
  certType: string | null;
  notBefore: string;
  subjectCountry: string | null;
  sanList: string[];
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
                <div className="space-y-1">
                  <div className="font-medium">
                    {cert.subjectOrg || cert.subjectCn || cert.sanList[0] || "Unknown"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {cert.sanList[0] || cert.subjectCn}
                    {cert.subjectCountry && ` · ${cert.subjectCountry}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{cert.certType || "BIMI"}</Badge>
                  <Badge variant="secondary">{cert.issuerOrg || "Unknown CA"}</Badge>
                  <span className="text-xs text-muted-foreground">
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
