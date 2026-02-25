import type { Metadata } from "next";
import { CertificateDetail } from "./certificate-detail";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const isHash = /^[0-9a-f]+$/i.test(id) && !/^\d+$/.test(id);
  const label = isHash ? `${id.slice(0, 12)}...` : `#${id}`;
  return {
    title: `Certificate ${label}`,
    description: `BIMI certificate details, chain, extensions, and validation results for certificate ${label}.`,
  };
}

export default async function CertificateDetailPage({ params }: Props) {
  const { id } = await params;
  return <CertificateDetail id={id} />;
}
