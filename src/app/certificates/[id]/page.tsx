import { CertificateDetail } from "./certificate-detail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CertificateDetailPage({ params }: Props) {
  const { id } = await params;
  return <CertificateDetail id={id} />;
}
