import type { Metadata } from "next";
import { permanentRedirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { resolveCertParam } from "@/lib/db/filters";
import { displayIssuerOrg, displayRootCa } from "@/lib/ca-display";
import { CertificateDetail } from "./certificate-detail";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { fingerprint } = await resolveCertParam(id);
  if (!fingerprint) {
    return { title: "Certificate Not Found" };
  }

  const [cert] = await db
    .select({
      fingerprintSha256: certificates.fingerprintSha256,
      subjectOrg: certificates.subjectOrg,
      certType: certificates.certType,
      issuerOrg: certificates.issuerOrg,
      rootCaOrg: certificates.rootCaOrg,
      notBefore: certificates.notBefore,
      notAfter: certificates.notAfter,
      sanList: certificates.sanList,
      markType: certificates.markType,
    })
    .from(certificates)
    .where(eq(certificates.fingerprintSha256, fingerprint))
    .limit(1);

  if (!cert) {
    return { title: "Certificate Not Found" };
  }

  const org = cert.subjectOrg || "Unknown";
  const type = cert.certType || "BIMI";
  const issuer = cert.issuerOrg ? displayIssuerOrg(cert.issuerOrg) : "Unknown CA";
  const rootCa = cert.rootCaOrg ? displayRootCa(cert.rootCaOrg) : null;
  const primaryDomain = cert.sanList?.[0] ?? "";
  const fp12 = fingerprint.slice(0, 12);

  const issuerChain = rootCa && rootCa !== issuer ? `${issuer} → ${rootCa}` : issuer;

  const daysLeft = cert.notAfter ? Math.floor((cert.notAfter.getTime() - Date.now()) / 86_400_000) : null;
  const validityText =
    cert.notBefore && cert.notAfter
      ? `Valid: ${cert.notBefore.toISOString().slice(0, 10)} to ${cert.notAfter.toISOString().slice(0, 10)}${daysLeft !== null ? ` (${daysLeft < 0 ? "expired" : `${daysLeft} days remaining`})` : ""}`
      : "";

  const sansText = cert.sanList?.length
    ? cert.sanList.length <= 3
      ? cert.sanList.join(", ")
      : `${cert.sanList.slice(0, 3).join(", ")} +${cert.sanList.length - 3} more`
    : "";

  const descParts = [
    `${type} certificate for ${org}${primaryDomain ? ` (${primaryDomain})` : ""}`,
    `Issued by ${issuerChain}`,
    validityText,
    sansText ? `SANs: ${sansText}` : "",
    `SHA256: ${fingerprint.slice(0, 16)}…`,
    `crt.sh: crt.sh/?q=${fingerprint.slice(0, 16)}`,
  ].filter(Boolean);

  const ogImageUrl = `/api/og/cert/${fp12}`;

  return {
    title: `${org} — ${type} Certificate`,
    description: descParts.join(" | "),
    openGraph: {
      title: `${org} — ${type} Certificate`,
      description: descParts.join(" | "),
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${org} — ${type} Certificate`,
      description: descParts.join(" | "),
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
  };
}

export default async function CertificateDetailPage({ params }: Props) {
  const { id } = await params;

  // Redirect non-canonical URLs (numeric IDs or short prefixes) to full fingerprint
  const { fingerprint, error } = await resolveCertParam(id);
  if (error) notFound();
  if (!fingerprint) notFound();
  if (id !== fingerprint) permanentRedirect(`/certificates/${fingerprint}`);

  return <CertificateDetail id={fingerprint} />;
}
