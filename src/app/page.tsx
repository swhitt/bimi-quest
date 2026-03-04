import type { Metadata } from "next";
import { DashboardContent } from "./dashboard-content";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Real-time BIMI certificate market intelligence. Track VMC and CMC issuances, CA market share, and industry adoption from CT logs.",
  openGraph: {
    title: "BIMI Quest — Certificate Market Intelligence Dashboard",
    description:
      "Track VMC and CMC certificate issuances across all Certificate Authorities. Real-time market intelligence from Certificate Transparency logs.",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BIMI Quest — Certificate Market Intelligence Dashboard",
    description:
      "Track VMC and CMC certificate issuances across all Certificate Authorities. Real-time market intelligence from Certificate Transparency logs.",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
};

export default async function DashboardPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;

  return (
    <div className="space-y-6">
      <DashboardContent searchParams={searchParams} />
    </div>
  );
}
