import type { Metadata } from "next";
import { permanentRedirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { resolveCertParam } from "@/lib/db/filters";
import { displayIssuerOrg } from "@/lib/ca-display";
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
      subjectOrg: certificates.subjectOrg,
      certType: certificates.certType,
      issuerOrg: certificates.issuerOrg,
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

  return {
    title: `${org} — ${type} Certificate`,
    description: `${type} certificate for ${org}, issued by ${issuer}. View chain, extensions, and BIMI validation details.`,
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
