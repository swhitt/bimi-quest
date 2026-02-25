import type { Metadata } from "next";
import { permanentRedirect, notFound } from "next/navigation";
import { resolveCertParam } from "@/lib/db/filters";
import { CertificateDetail } from "./certificate-detail";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: id.length > 16 ? `${id.slice(0, 16)}...` : id,
    description: `BIMI certificate details, chain, extensions, and validation for ${id}.`,
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
