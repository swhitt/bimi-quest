import type { Metadata } from "next";
import { DomainAnalysis } from "./domain-analysis";

interface Props {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  const decoded = decodeURIComponent(domain);
  const title = `${decoded} — BIMI Analysis`;
  const description = `BIMI certificate status, DNS records, and email authentication analysis for ${decoded}.`;
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary", title, description },
  };
}

export default async function DomainPage({ params }: Props) {
  const { domain } = await params;
  return <DomainAnalysis domain={decodeURIComponent(domain)} />;
}
