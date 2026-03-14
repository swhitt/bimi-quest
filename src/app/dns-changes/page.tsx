import type { Metadata } from "next";
import { DnsChangesContent } from "./dns-changes-content";

export const metadata: Metadata = {
  title: "DNS Changes",
  description: "Browse BIMI and DMARC DNS record changes detected across monitored domains.",
  openGraph: {
    title: "DNS Changes — BIMI Quest",
    description:
      "Track BIMI and DMARC DNS record changes including policy updates, logo changes, and record creation/removal.",
    images: [{ url: "/api/og/default", width: 1200, height: 630 }],
  },
};

export default async function DnsChangesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;

  return (
    <div className="sm:space-y-3">
      <h1 className="text-lg font-semibold hidden sm:block">DNS Changes</h1>
      <DnsChangesContent searchParams={searchParams} />
    </div>
  );
}
