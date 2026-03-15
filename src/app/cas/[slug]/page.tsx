import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CA_SLUG_TO_NAME, CA_DISPLAY_NAMES } from "@/lib/ca-slugs";
import { getCaStats } from "@/lib/data/ca-stats";
import { CaContent } from "./ca-content";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ intermediate?: string }>;
}

const resolveSlug = cache(async (slug: string) => {
  const rootCaOrg = CA_SLUG_TO_NAME[slug.toLowerCase()];
  return rootCaOrg ?? null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const rootCaOrg = await resolveSlug(slug);
  if (!rootCaOrg) return { title: "CA Not Found" };

  const displayName = CA_DISPLAY_NAMES[slug.toLowerCase()] ?? rootCaOrg;
  return {
    alternates: { canonical: `/cas/${slug}` },
    title: `${displayName} — BIMI Certificates`,
    description: `BIMI VMC and CMC certificates issued by ${displayName}. Certificate counts, intermediates, and top organizations.`,
  };
}

export default async function CaPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { intermediate } = await searchParams;
  const rootCaOrg = await resolveSlug(slug);
  if (!rootCaOrg) notFound();

  const displayName = CA_DISPLAY_NAMES[slug.toLowerCase()] ?? rootCaOrg;
  const intermediateOrg = intermediate ? (CA_SLUG_TO_NAME[intermediate] ?? intermediate) : undefined;
  const stats = await getCaStats(rootCaOrg, intermediateOrg);

  return (
    <CaContent
      slug={slug}
      displayName={displayName}
      rootCaOrg={rootCaOrg}
      intermediateFilter={intermediateOrg ?? null}
      stats={stats}
    />
  );
}
