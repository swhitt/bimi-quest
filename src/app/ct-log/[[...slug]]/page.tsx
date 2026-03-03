import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CTLogContent } from "../ct-log-content";

interface Props {
  params: Promise<{ slug?: string[] }>;
}

function parseEntryIndex(slug?: string[]): number | undefined {
  if (!slug?.length) return undefined;
  const parsed = parseInt(slug[0], 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entryIndex = parseEntryIndex(slug);

  if (slug?.length && entryIndex === undefined) {
    return { title: "CT Log Entry Not Found" };
  }

  if (entryIndex !== undefined) {
    return {
      title: `CT Log Entry #${entryIndex.toLocaleString()}`,
      description: `Certificate Transparency log entry at index ${entryIndex.toLocaleString()} from the Gorgon CT log.`,
    };
  }

  return {
    title: "CT Log Viewer",
    description: "Browse and inspect raw Certificate Transparency log entries from Gorgon.",
  };
}

export default async function CTLogPage({ params }: Props) {
  const { slug } = await params;
  const entryIndex = parseEntryIndex(slug);

  if (slug?.length && entryIndex === undefined) notFound();

  await connection();
  return (
    <Suspense>
      <CTLogContent permalinkedIndex={entryIndex} />
    </Suspense>
  );
}
