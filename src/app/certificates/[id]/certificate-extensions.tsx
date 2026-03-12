"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { domainUrl } from "@/lib/entity-urls";
import { decodeExtension } from "@/lib/x509/decode-extensions";
import type { Asn1Node } from "@/lib/x509/asn1-tree";
import { buildAsn1Tree, pemToDerBytes } from "@/lib/x509/asn1-tree";
import type { CertData } from "./certificate-types";
import { formatSerial } from "./certificate-types";

const Asn1Tree = dynamic(
  () =>
    import("@/components/x509/asn1-tree").then((m) => ({
      default: m.Asn1Tree,
    })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-48" />,
  },
);
const DerHexViewer = dynamic(
  () =>
    import("@/components/x509/der-hex-viewer").then((m) => ({
      default: m.DerHexViewer,
    })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-48" />,
  },
);

function resolveAsn1NodePath(tree: Asn1Node, pathStr: string): Asn1Node | null {
  const indices = pathStr.split("/").map(Number);
  if (indices.length === 0 || indices[0] !== 0) return null;
  let current = tree;
  for (let i = 1; i < indices.length; i++) {
    const idx = indices[i];
    if (idx < 0 || idx >= current.children.length) return null;
    current = current.children[idx];
  }
  return current;
}

function findAsn1NodeAtOffset(tree: Asn1Node, offset: number): Asn1Node | null {
  if (offset < tree.headerOffset || offset >= tree.headerOffset + tree.totalLength) return null;
  for (const child of tree.children) {
    const found = findAsn1NodeAtOffset(child, offset);
    if (found) return found;
  }
  return tree;
}

function buildAsn1NodePath(tree: Asn1Node, target: Asn1Node): string | null {
  function walk(node: Asn1Node, path: string): string | null {
    if (node === target) return path;
    for (let i = 0; i < node.children.length; i++) {
      const result = walk(node.children[i], `${path}/${i}`);
      if (result) return result;
    }
    return null;
  }
  return walk(tree, "0");
}

function formatCertDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toUTCString().replace("GMT", "UTC");
}

function parseBimiSubjectFields(dn: string): [string, string][] {
  const bimiOids: Record<string, string> = {
    "1.3.6.1.4.1.53087.1.2": "BIMI Trademark Office",
    "1.3.6.1.4.1.53087.1.3": "BIMI Trademark Country",
    "1.3.6.1.4.1.53087.1.4": "BIMI Trademark ID",
    "1.3.6.1.4.1.53087.1.13": "BIMI Mark Type",
  };
  const results: [string, string][] = [];
  for (const [oid, label] of Object.entries(bimiOids)) {
    const re = new RegExp(`${oid.replace(/\./g, "\\.")}\\s*=\\s*([^,+]+)`);
    const m = dn.match(re);
    if (m) results.push([label, m[1].trim()]);
  }
  return results;
}

function CertLine({
  label,
  value,
  indent,
  muted,
  highlight,
}: {
  label: string;
  value: string;
  indent: number;
  muted?: boolean;
  highlight?: "destructive";
}) {
  const pad = indent * 1.25;
  return (
    <div style={{ paddingLeft: `${pad}rem` }}>
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span
        className={
          highlight === "destructive" ? "text-destructive font-medium" : muted ? "text-muted-foreground/70" : ""
        }
      >
        {value}
      </span>
    </div>
  );
}

function CertSection({ title, indent, children }: { title: string; indent: number; children: React.ReactNode }) {
  const pad = indent * 1.25;
  return (
    <div>
      <div style={{ paddingLeft: `${pad}rem` }} className="font-medium text-foreground">
        {title}:
      </div>
      {children}
    </div>
  );
}

export function CertificateExtensions({ data }: { data: CertData }) {
  const cert = data.certificate;
  const isExpired = new Date(cert.notAfter) < new Date();

  const [showAsn1, setShowAsn1] = useState(
    () => typeof window !== "undefined" && window.location.hash.startsWith("#asn1"),
  );
  const [selectedAsn1Node, setSelectedAsn1Node] = useState<Asn1Node | null>(null);
  const asn1SectionRef = useRef<HTMLDivElement>(null);

  const rawPem = cert.rawPem ?? null;
  const asn1Parsed = useMemo(() => {
    if (!showAsn1 || !rawPem) return null;
    try {
      const derBytes = pemToDerBytes(rawPem);
      const tree = buildAsn1Tree(derBytes);
      return { tree, derBytes };
    } catch {
      return null;
    }
  }, [showAsn1, rawPem]);

  const handleAsn1NodeSelect = useCallback(
    (node: Asn1Node) => {
      setSelectedAsn1Node(node);
      if (asn1Parsed) {
        const path = buildAsn1NodePath(asn1Parsed.tree, node);
        if (path) {
          window.history.replaceState(null, "", `#asn1/${path}`);
        }
      }
    },
    [asn1Parsed],
  );

  const handleAsn1ByteClick = useCallback(
    (offset: number) => {
      if (!asn1Parsed) return;
      const node = findAsn1NodeAtOffset(asn1Parsed.tree, offset);
      if (node) handleAsn1NodeSelect(node);
    },
    [asn1Parsed, handleAsn1NodeSelect],
  );

  const asn1HighlightRange = useMemo(() => {
    if (!selectedAsn1Node) return null;
    return {
      start: selectedAsn1Node.headerOffset,
      end: selectedAsn1Node.headerOffset + selectedAsn1Node.totalLength,
      headerEnd: selectedAsn1Node.valueOffset,
    };
  }, [selectedAsn1Node]);

  const asn1HashResolved = useRef(false);

  useEffect(() => {
    if (!asn1Parsed || !showAsn1 || asn1HashResolved.current) return;
    const hash = window.location.hash;
    if (!hash.startsWith("#asn1")) return;
    asn1HashResolved.current = true;

    asn1SectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    const prefix = "#asn1/";
    if (hash.startsWith(prefix) && hash.length > prefix.length) {
      const pathPart = hash.slice(prefix.length);
      const node = resolveAsn1NodePath(asn1Parsed.tree, pathPart);
      if (node) requestAnimationFrame(() => handleAsn1NodeSelect(node));
    }
  }, [asn1Parsed, showAsn1, handleAsn1NodeSelect]);

  return (
    <>
      {/* Certificate Details - parsed X.509 fields */}
      <Card>
        <CardHeader>
          <CardTitle>Certificate Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-mono text-sm space-y-0.5 overflow-x-auto">
            <CertLine label="Serial Number" value={formatSerial(cert.serialNumber)} indent={2} />
            <div className="pt-1" />
            <CertSection title="Issuer" indent={2}>
              {cert.issuerCn && <CertLine label="commonName" value={cert.issuerCn} indent={3} />}
              {cert.issuerOrg && <CertLine label="organizationName" value={cert.issuerOrg} indent={3} />}
            </CertSection>
            <div className="pt-1" />
            <CertSection title="Validity" indent={2}>
              <CertLine label="Not Before" value={formatCertDate(cert.notBefore)} indent={3} />
              <CertLine
                label="Not After"
                value={formatCertDate(cert.notAfter)}
                indent={3}
                highlight={isExpired ? "destructive" : undefined}
              />
            </CertSection>
            <div className="pt-1" />
            <CertSection title="Subject" indent={2}>
              {cert.subjectCn && <CertLine label="commonName" value={cert.subjectCn} indent={3} />}
              {cert.subjectOrg && <CertLine label="organizationName" value={cert.subjectOrg} indent={3} />}
              {cert.subjectCountry && <CertLine label="countryName" value={cert.subjectCountry} indent={3} />}
              {cert.subjectState && <CertLine label="stateOrProvinceName" value={cert.subjectState} indent={3} />}
              {cert.subjectLocality && <CertLine label="localityName" value={cert.subjectLocality} indent={3} />}
              {parseBimiSubjectFields(cert.subjectDn).map(([oid, val]) => (
                <CertLine key={oid} label={oid} value={val} indent={3} />
              ))}
            </CertSection>
            {cert.sanList.length > 0 && (
              <>
                <div className="pt-1" />
                <CertSection title="Subject Alternative Names" indent={2}>
                  {cert.sanList.map((san) => {
                    const otherCount = data.sanCertCounts[san] ?? 0;
                    const totalCount = otherCount > 0 ? otherCount + 1 : 0;
                    return (
                      <div key={san} className="pl-[3.5rem] flex items-center gap-1">
                        <span className="text-muted-foreground">DNS:</span>
                        <Link
                          href={domainUrl(san)}
                          className="font-mono text-sm text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {san}
                        </Link>
                        {totalCount > 1 && (
                          <span className="text-xs text-muted-foreground font-normal">· {totalCount} certs</span>
                        )}
                      </div>
                    );
                  })}
                </CertSection>
              </>
            )}
            {cert.extensionsJson && Object.keys(cert.extensionsJson).length > 0 && (
              <>
                <div className="pt-1" />
                <CertSection title="X509v3 Extensions" indent={2}>
                  {Object.entries(cert.extensionsJson).map(([oid, value]) => {
                    const hexStr =
                      typeof value === "string"
                        ? value
                        : typeof value === "object" && value && "v" in value
                          ? (value as { v: string }).v
                          : JSON.stringify(value);
                    const isCritical =
                      typeof value === "object" && value && "c" in value ? (value as { c: boolean }).c : false;
                    const ext = decodeExtension(oid, hexStr);
                    const displayName = ext.name !== "Unknown" ? ext.name : oid;
                    const showOid = ext.name !== "Unknown";
                    return (
                      <div key={oid} className="pl-[3.5rem] py-0.5">
                        <span className="text-muted-foreground">
                          {displayName}
                          {showOid && <span className="text-muted-foreground font-mono text-xs ml-1">({oid})</span>}:
                        </span>
                        {isCritical && (
                          <Badge variant="destructive" className="ml-1.5 text-[10px] px-1 py-0 h-4 align-text-top">
                            Critical
                          </Badge>
                        )}
                        {ext.decoded ? (
                          <span className="ml-2 whitespace-pre-wrap break-all">{ext.decoded}</span>
                        ) : (
                          <span className="ml-2 text-muted-foreground/60 break-all">
                            {hexStr.substring(0, 64)}
                            {hexStr.length > 64 ? "..." : ""}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </CertSection>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ASN.1 Structure */}
      <Card ref={asn1SectionRef}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>ASN.1 Structure</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const next = !showAsn1;
              setShowAsn1(next);
              if (next) {
                window.history.replaceState(null, "", "#asn1");
              } else {
                window.history.replaceState(null, "", window.location.pathname);
                setSelectedAsn1Node(null);
              }
            }}
          >
            {showAsn1 ? "Hide" : "Show"}
          </Button>
        </CardHeader>
        {showAsn1 && asn1Parsed && (
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: 400 }}>
              <Asn1Tree
                root={asn1Parsed.tree}
                selectedNode={selectedAsn1Node}
                onSelectNode={handleAsn1NodeSelect}
                className="max-h-[600px] border rounded-md p-1"
              />
              <DerHexViewer
                bytes={asn1Parsed.derBytes}
                highlightRange={asn1HighlightRange}
                onByteClick={handleAsn1ByteClick}
                className="max-h-[600px]"
              />
            </div>
            {selectedAsn1Node && (
              <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm font-mono space-y-1">
                <div>
                  <span className="text-muted-foreground">Tag: </span>
                  {selectedAsn1Node.tagName}
                  <span className="text-muted-foreground ml-2">
                    (0x
                    {selectedAsn1Node.tag.toString(16).padStart(2, "0")})
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Offset: </span>
                  {selectedAsn1Node.headerOffset}
                  <span className="text-muted-foreground ml-2">
                    (header: {selectedAsn1Node.headerLength}B, value: {selectedAsn1Node.valueLength}B, total:{" "}
                    {selectedAsn1Node.totalLength}B)
                  </span>
                </div>
                {selectedAsn1Node.decoded && (
                  <div>
                    <span className="text-muted-foreground">Value: </span>
                    <span className="break-all">{selectedAsn1Node.decoded}</span>
                  </div>
                )}
                {selectedAsn1Node.oidName && (
                  <div>
                    <span className="text-muted-foreground">OID: </span>
                    {selectedAsn1Node.oidName}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
        {showAsn1 && !asn1Parsed && (
          <CardContent>
            <p className="text-sm text-destructive">Failed to parse ASN.1 structure from certificate PEM.</p>
          </CardContent>
        )}
      </Card>
    </>
  );
}
