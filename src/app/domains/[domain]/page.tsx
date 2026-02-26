import type { Metadata } from "next";
import { DomainAnalysis } from "./domain-analysis";

interface Props {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  const decoded = decodeURIComponent(domain);
  return {
    title: `${decoded} — BIMI Analysis`,
    description: `BIMI certificate status, DNS records, and email authentication analysis for ${decoded}.`,
  };
}

export default async function DomainPage({ params }: Props) {
  const { domain } = await params;
  return <DomainAnalysis domain={decodeURIComponent(domain)} />;
}
