import type { Metadata } from "next";
import { CertificateDetail } from "./certificate-detail";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Certificate #${id}`,
    description: `BIMI certificate details, chain, extensions, and validation results for certificate #${id}.`,
  };
}

export default async function CertificateDetailPage({ params }: Props) {
  const { id } = await params;
  return <CertificateDetail id={id} />;
}
