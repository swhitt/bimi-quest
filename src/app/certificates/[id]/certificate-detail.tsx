"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";

interface CertData {
  certificate: {
    id: number;
    fingerprintSha256: string;
    serialNumber: string;
    notBefore: string;
    notAfter: string;
    subjectDn: string;
    subjectCn: string | null;
    subjectOrg: string | null;
    subjectCountry: string | null;
    subjectState: string | null;
    subjectLocality: string | null;
    issuerDn: string;
    issuerCn: string | null;
    issuerOrg: string | null;
    sanList: string[];
    markType: string | null;
    certType: string | null;
    logotypeSvg: string | null;
    rawPem: string;
    ctLogTimestamp: string | null;
    ctLogIndex: string | null;
    extensionsJson: Record<string, string> | null;
    crtshId: string | null;
  };
  chain: {
    id: number;
    chainPosition: number;
    fingerprintSha256: string;
    subjectDn: string;
    issuerDn: string;
    notBefore: string | null;
    notAfter: string | null;
  }[];
  bimiStates: {
    domain: string;
    bimiRecordRaw: string | null;
    dmarcPolicy: string | null;
    dmarcValid: boolean | null;
    svgTinyPsValid: boolean | null;
  }[];
}

// Well-known OID names
const OID_NAMES: Record<string, string> = {
  "2.5.29.14": "Subject Key Identifier",
  "2.5.29.15": "Key Usage",
  "2.5.29.17": "Subject Alternative Name",
  "2.5.29.19": "Basic Constraints",
  "2.5.29.31": "CRL Distribution Points",
  "2.5.29.32": "Certificate Policies",
  "2.5.29.35": "Authority Key Identifier",
  "2.5.29.37": "Extended Key Usage",
  "1.3.6.1.5.5.7.1.1": "Authority Information Access",
  "1.3.6.1.5.5.7.1.12": "Logotype (RFC 3709)",
  "1.3.6.1.4.1.53087.1.13": "BIMI Mark Type",
  "1.3.6.1.4.1.11129.2.4.2": "CT Precert SCTs",
};

export function CertificateDetail({ id }: { id: string }) {
  const [data, setData] = useState<CertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPem, setShowPem] = useState(false);

  useEffect(() => {
    fetch(`/api/certificates/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Certificate not found");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading certificate...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-64 items-center justify-center text-destructive">
        {error || "Certificate not found"}
      </div>
    );
  }

  const cert = data.certificate;
  const isExpired = new Date(cert.notAfter) < new Date();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {cert.subjectOrg || cert.subjectCn || cert.sanList[0] || "Certificate"}
          </h1>
          <p className="text-muted-foreground">
            {cert.sanList[0] || cert.subjectCn}
            {cert.subjectCountry && ` · ${cert.subjectCountry}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isExpired ? "destructive" : "default"}>
            {isExpired ? "Expired" : "Valid"}
          </Badge>
          <Badge variant="outline">{cert.certType || "BIMI"}</Badge>
          <Badge variant="secondary">{cert.issuerOrg || "Unknown CA"}</Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Subject Details */}
        <Card>
          <CardHeader>
            <CardTitle>Subject</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Common Name" value={cert.subjectCn} />
            <Row label="Organization" value={cert.subjectOrg} />
            <Row label="Country" value={cert.subjectCountry} />
            <Row label="State" value={cert.subjectState} />
            <Row label="Locality" value={cert.subjectLocality} />
            <Row label="Full DN" value={cert.subjectDn} />
          </CardContent>
        </Card>

        {/* Issuer + Validity */}
        <Card>
          <CardHeader>
            <CardTitle>Issuer & Validity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Issuer CN" value={cert.issuerCn} />
            <Row label="Issuer Org" value={cert.issuerOrg} />
            <Row label="Issuer DN" value={cert.issuerDn} />
            <Separator className="my-2" />
            <Row
              label="Valid From"
              value={format(new Date(cert.notBefore), "PPP")}
            />
            <Row
              label="Valid To"
              value={format(new Date(cert.notAfter), "PPP")}
            />
            <Row label="Serial Number" value={cert.serialNumber} />
            <Row label="Mark Type" value={cert.markType} />
          </CardContent>
        </Card>
      </div>

      {/* SANs */}
      {cert.sanList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subject Alternative Names ({cert.sanList.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {cert.sanList.map((san) => (
                <Badge key={san} variant="outline">
                  {san}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* SVG Logo */}
      {cert.logotypeSvg && (
        <Card>
          <CardHeader>
            <CardTitle>Logo (SVG)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-6">
              <div
                className="h-24 w-24 rounded-lg border bg-white p-2"
                dangerouslySetInnerHTML={{ __html: cert.logotypeSvg }}
              />
              <pre className="max-h-48 flex-1 overflow-auto rounded-md bg-muted p-3 text-xs">
                {cert.logotypeSvg}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Certificate Chain */}
      {data.chain.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Certificate Chain</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Leaf cert */}
              <div className="rounded-lg border-2 border-primary/50 p-3">
                <div className="font-medium">Leaf Certificate</div>
                <div className="text-sm text-muted-foreground">{cert.subjectDn}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  SHA-256: {cert.fingerprintSha256}
                </div>
              </div>
              {/* Chain certs */}
              {data.chain.map((c) => (
                <div key={c.id} className="ml-6 rounded-lg border p-3">
                  <div className="font-medium">
                    {c.chainPosition === 1 ? "Intermediate" : `Chain Position ${c.chainPosition}`}
                  </div>
                  <div className="text-sm text-muted-foreground">{c.subjectDn}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    SHA-256: {c.fingerprintSha256}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Extensions */}
      {cert.extensionsJson && Object.keys(cert.extensionsJson).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Extensions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Value (hex)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(cert.extensionsJson).map(([oid, value]) => (
                  <TableRow key={oid}>
                    <TableCell className="font-mono text-xs">{oid}</TableCell>
                    <TableCell>{OID_NAMES[oid] || "Unknown"}</TableCell>
                    <TableCell className="max-w-xs truncate font-mono text-xs">
                      {typeof value === "string" ? value.substring(0, 80) : JSON.stringify(value).substring(0, 80)}
                      {typeof value === "string" && value.length > 80 ? "..." : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* BIMI Validation for associated domains */}
      {data.bimiStates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>BIMI Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>BIMI Record</TableHead>
                  <TableHead>DMARC Policy</TableHead>
                  <TableHead>DMARC Valid</TableHead>
                  <TableHead>SVG Valid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.bimiStates.map((state) => (
                  <TableRow key={state.domain}>
                    <TableCell className="font-medium">{state.domain}</TableCell>
                    <TableCell>
                      {state.bimiRecordRaw ? (
                        <Badge variant="outline">Found</Badge>
                      ) : (
                        <Badge variant="destructive">Missing</Badge>
                      )}
                    </TableCell>
                    <TableCell>{state.dmarcPolicy || "-"}</TableCell>
                    <TableCell>
                      {state.dmarcValid === true ? (
                        <Badge>Pass</Badge>
                      ) : state.dmarcValid === false ? (
                        <Badge variant="destructive">Fail</Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {state.svgTinyPsValid === true ? (
                        <Badge>Pass</Badge>
                      ) : state.svgTinyPsValid === false ? (
                        <Badge variant="destructive">Fail</Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Raw PEM */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Raw PEM</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPem(!showPem)}
            >
              {showPem ? "Hide" : "Show"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard.writeText(cert.rawPem)}
            >
              Copy
            </Button>
          </div>
        </CardHeader>
        {showPem && (
          <CardContent>
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs font-mono">
              {cert.rawPem}
            </pre>
          </CardContent>
        )}
      </Card>

      {/* CT Log Info */}
      <Card>
        <CardHeader>
          <CardTitle>CT Log Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Fingerprint (SHA-256)" value={cert.fingerprintSha256} />
          <Row
            label="CT Log Timestamp"
            value={
              cert.ctLogTimestamp
                ? format(new Date(cert.ctLogTimestamp), "PPP pp")
                : null
            }
          />
          <Row label="CT Log Index" value={cert.ctLogIndex} />
          {cert.crtshId && (
            <Row label="crt.sh ID" value={cert.crtshId} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-4">
      <span className="w-40 shrink-0 text-muted-foreground">{label}</span>
      <span className="break-all">{value || "-"}</span>
    </div>
  );
}
