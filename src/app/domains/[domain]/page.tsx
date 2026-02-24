import { DomainAnalysis } from "./domain-analysis";

interface Props {
  params: Promise<{ domain: string }>;
}

export default async function DomainPage({ params }: Props) {
  const { domain } = await params;
  return <DomainAnalysis domain={decodeURIComponent(domain)} />;
}
