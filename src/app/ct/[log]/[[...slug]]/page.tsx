import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { decodeCTEntry } from "@/lib/ct/decode-entry";
import { getEntries, getSTH } from "@/lib/ct/gorgon";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "../constants";
import { CTLogContent } from "../ct-log-content";

/** Known CT log slugs — add new logs here as they launch. */
const KNOWN_LOGS = new Set(["gorgon"]);

interface Props {
  params: Promise<{ log: string; slug?: string[] }>;
  searchParams: Promise<{ start?: string; count?: string }>;
}

function parseSlug(slug?: string[]): { entryIndex?: number; pageNumber?: number } {
  if (!slug?.length) return {};
  // /ct/gorgon/page/N → page number
  if (slug[0] === "page" && slug.length === 2) {
    const parsed = parseInt(slug[1], 10);
    if (Number.isFinite(parsed) && parsed >= 1) return { pageNumber: parsed };
    return {};
  }
  // /ct/gorgon/12345 → entry permalink
  const parsed = parseInt(slug[0], 10);
  if (Number.isFinite(parsed) && parsed >= 0) return { entryIndex: parsed };
  return {};
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

  const { entryIndex, pageNumber } = parseSlug(slug);

  if (slug?.length && entryIndex === undefined && pageNumber === undefined) {
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

  // List / page view: static metadata
  const listDescription =
    "Browse raw Certificate Transparency log entries from the Gorgon CT log with decoded certificates, annotated hex viewer, and chain analysis.";
  const pageSuffix = pageNumber !== undefined ? ` — Page ${pageNumber}` : "";
  return {
    title: `CT Log Viewer${pageSuffix}`,
    description: listDescription,
    openGraph: {
      title: `CT Log Viewer — Gorgon Certificate Transparency${pageSuffix}`,
      description: listDescription,
      images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `CT Log Viewer — Gorgon Certificate Transparency${pageSuffix}`,
      description: listDescription,
      images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    },
  };
}

export default async function CTLogPage({ params, searchParams }: Props) {
  const { log, slug } = await params;
  const query = await searchParams;

  if (!KNOWN_LOGS.has(log)) notFound();

  const { entryIndex, pageNumber } = parseSlug(slug);

  if (slug?.length && entryIndex === undefined && pageNumber === undefined) notFound();

  // Compute initialStart from page number or query param
  let initialStart: number | undefined;
  const queryStart = query.start ? parseInt(query.start, 10) : undefined;
  const queryCount = query.count ? parseInt(query.count, 10) : undefined;
  const pageSize =
    queryCount && (PAGE_SIZES as readonly number[]).includes(queryCount) ? queryCount : DEFAULT_PAGE_SIZE;

  if (queryStart !== undefined && Number.isFinite(queryStart)) {
    initialStart = Math.max(0, queryStart);
  } else if (pageNumber !== undefined) {
    initialStart = (pageNumber - 1) * pageSize;
  }

  await connection();
  return (
    <Suspense>
      <CTLogContent
        logSlug={log}
        permalinkedIndex={entryIndex}
        initialStart={initialStart}
        initialPageSize={pageSize !== DEFAULT_PAGE_SIZE ? pageSize : undefined}
      />
    </Suspense>
  );
}
