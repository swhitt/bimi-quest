import type { Metadata } from "next";
import { CertificatesContent } from "./certificates-content";

export const metadata: Metadata = {
  title: "Certificates",
  description: "Browse and filter all BIMI VMC and CMC certificates discovered from Certificate Transparency logs.",
  openGraph: {
    title: "Certificates",
    description:
      "Browse and search every BIMI VMC and CMC certificate discovered from Certificate Transparency logs. Filter by issuer, industry, country, and more.",
    images: [{ url: "/api/og/default", width: 1200, height: 630 }],
  },
};

export default async function CertificatesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;

  return (
    <div className="sm:space-y-3">
      <h1 className="text-lg font-semibold hidden sm:block">Certificates</h1>
      <CertificatesContent searchParams={searchParams} />
    </div>
  );
}
