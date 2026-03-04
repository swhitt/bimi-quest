import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { decodeCTEntry } from "@/lib/ct/decode-entry";
import { getEntries, getSTH } from "@/lib/ct/gorgon";
import { CTLogContent } from "../ct-log-content";

/** Known CT log slugs — add new logs here as they launch. */
const KNOWN_LOGS = new Set(["gorgon"]);

interface Props {
  params: Promise<{ log: string; slug?: string[] }>;
}

function parseEntryIndex(slug?: string[]): number | undefined {
  if (!slug?.length) return undefined;
  const parsed = parseInt(slug[0], 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

const fetchEntry = cache(async (index: number) => {
  try {
    const sth = await getSTH();
    if (index >= sth.tree_size) return null;
    const response = await getEntries(index, index);
    if (!response.entries.length) return null;
    return decodeCTEntry(response.entries[0], index);
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { log, slug } = await params;

  if (!KNOWN_LOGS.has(log)) return { title: "CT Log Not Found" };

  const entryIndex = parseEntryIndex(slug);

  if (slug?.length && entryIndex === undefined) {
    return { title: "CT Log Entry Not Found" };
  }

  // Entry permalink: fetch and decode for rich metadata
  if (entryIndex !== undefined) {
    const entry = await fetchEntry(entryIndex);
    if (!entry) {
      return { title: "CT Log Entry Not Found" };
    }

    const subject = entry.cert?.subject || "Unknown Subject";
    const issuer = entry.cert?.issuer || "Unknown Issuer";
    const type = entry.leaf.entryType === "precert_entry" ? "Precert" : "X.509";
    const bimi = entry.cert?.isBIMI ? " · BIMI" : "";
    const ogImageUrl = `/api/og/ct/${log}/${entryIndex}`;

    const title = `CT Entry #${entryIndex.toLocaleString()} — ${subject}`;
    const description = `${type}${bimi} | Issued by ${issuer} | ${entry.leaf.timestampDate}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: [{ url: ogImageUrl, width: 1200, height: 630 }],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [{ url: ogImageUrl, width: 1200, height: 630 }],
      },
    };
  }

  // List view: static metadata
  const listDescription =
    "Browse raw Certificate Transparency log entries from the Gorgon CT log with decoded certificates, annotated hex viewer, and chain analysis.";
  return {
    title: "CT Log Viewer",
    description: listDescription,
    openGraph: {
      title: "CT Log Viewer — Gorgon Certificate Transparency",
      description: listDescription,
      images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "CT Log Viewer — Gorgon Certificate Transparency",
      description: listDescription,
      images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    },
  };
}

export default async function CTLogPage({ params }: Props) {
  const { log, slug } = await params;

  if (!KNOWN_LOGS.has(log)) notFound();

  const entryIndex = parseEntryIndex(slug);

  if (slug?.length && entryIndex === undefined) notFound();

  await connection();
  return (
    <Suspense>
      <CTLogContent logSlug={log} permalinkedIndex={entryIndex} />
    </Suspense>
  );
}
