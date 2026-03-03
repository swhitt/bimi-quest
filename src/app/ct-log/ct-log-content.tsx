"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EntryDetail } from "@/components/ct-log/entry-detail";
import { EntryList } from "@/components/ct-log/entry-list";
import { EntryNavigator } from "@/components/ct-log/entry-navigator";
import { STHPanel, type STHResponse } from "@/components/ct-log/sth-panel";
import { Card, CardContent } from "@/components/ui/card";
import type { DecodedCTEntry } from "@/lib/ct/decode-entry";

const DEFAULT_PAGE_SIZE = 100;
const STH_POLL_INTERVAL = 60_000;

function buildListUrl(start: number, count: number): string {
  const params = new URLSearchParams();
  params.set("start", String(start));
  if (count !== DEFAULT_PAGE_SIZE) params.set("count", String(count));
  return `/ct-log?${params}`;
}

/** Update browser URL without triggering Next.js navigation or component remount */
function replaceUrl(url: string) {
  window.history.replaceState(window.history.state, "", url);
}

interface EntriesResponse {
  entries: DecodedCTEntry[];
  range: { start: number; end: number; treeSize: number };
}

interface CTLogContentProps {
  permalinkedIndex?: number;
}

export function CTLogContent({ permalinkedIndex }: CTLogContentProps) {
  const searchParams = useSearchParams();

  const [sth, setSTH] = useState<STHResponse | null>(null);
  const [sthLoading, setSTHLoading] = useState(true);
  const [entries, setEntries] = useState<DecodedCTEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [startIndex, setStartIndex] = useState<number | null>(() => {
    if (permalinkedIndex !== undefined) {
      return Math.max(0, permalinkedIndex - Math.floor(DEFAULT_PAGE_SIZE / 2));
    }
    const s = searchParams.get("start");
    if (!s) return null;
    const parsed = parseInt(s, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
  });
  const [pageSize, setPageSize] = useState(() => {
    const c = searchParams.get("count");
    const parsed = c ? parseInt(c, 10) : DEFAULT_PAGE_SIZE;
    return [50, 100, 200].includes(parsed) ? parsed : DEFAULT_PAGE_SIZE;
  });
  const [selectedIndex, setSelectedIndex] = useState<number | null>(permalinkedIndex ?? null);
  const [error, setError] = useState<string | null>(null);

  const detailRef = useRef<HTMLDivElement>(null);
  const jumpInputRef = useRef<HTMLInputElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for stable callbacks (avoids re-creating on every state change)
  const selectedRef = useRef<number | null>(selectedIndex);
  const startRef = useRef<number | null>(startIndex);
  const pageSizeRef = useRef(pageSize);
  selectedRef.current = selectedIndex;
  startRef.current = startIndex;
  pageSizeRef.current = pageSize;

  // Cmd/Ctrl+G focuses jump-to-index input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "g") {
        e.preventDefault();
        jumpInputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fetch STH
  const fetchSTH = useCallback(async () => {
    try {
      const res = await fetch("/api/ct-log/sth");
      if (!res.ok) throw new Error("Failed to fetch STH");
      const data: STHResponse = await res.json();
      setSTH(data);
      return data;
    } catch {
      setError("Failed to fetch Signed Tree Head");
      return null;
    } finally {
      setSTHLoading(false);
    }
  }, []);

  const abortRef = useRef<AbortController | null>(null);

  // Fetch entries for a given start index
  const fetchEntries = useCallback(async (start: number, size: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ct-log/entries?start=${start}&count=${size}`, { signal: controller.signal });
      if (!res.ok) throw new Error("Failed to fetch entries");
      const data: EntriesResponse = await res.json();
      setEntries(data.entries);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError("Failed to fetch CT log entries");
      setEntries([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  // Initial load: fetch STH, then jump to latest entries (unless URL has start or permalink)
  useEffect(() => {
    fetchSTH().then((data) => {
      if (data && startIndex === null) {
        const start = Math.max(0, data.tree_size - pageSize);
        setStartIndex(start);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  // Poll STH on an interval
  useEffect(() => {
    const id = setInterval(fetchSTH, STH_POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchSTH]);

  // Fetch entries when startIndex or pageSize changes
  useEffect(() => {
    if (startIndex === null) return;
    fetchEntries(startIndex, pageSize);
  }, [startIndex, pageSize, fetchEntries]);

  // Auto-scroll entry row to center of viewport when a permalinked entry loads
  useEffect(() => {
    if (permalinkedIndex === undefined) return;
    if (selectedIndex !== permalinkedIndex) return;
    if (!entries.some((e) => e.index === permalinkedIndex)) return;
    const row = document.querySelector(`[data-entry-index="${permalinkedIndex}"]`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [permalinkedIndex, selectedIndex, entries]);

  // Cleanup scroll timer on unmount
  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  // Navigate to a new start index (clears selection, updates URL)
  const handleNavigate = useCallback((newStart: number) => {
    setStartIndex(newStart);
    setSelectedIndex(null);
    replaceUrl(buildListUrl(newStart, pageSizeRef.current));
  }, []);

  // Change page size
  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    const si = startRef.current;
    if (selectedRef.current !== null) return;
    if (si !== null) {
      replaceUrl(buildListUrl(si, size));
    }
  }, []);

  // Select/deselect an entry (updates URL to entry permalink or list view)
  const handleSelect = useCallback((index: number) => {
    const prev = selectedRef.current;
    const next = index === prev ? null : index;
    setSelectedIndex(next);

    if (next !== null) {
      replaceUrl(`/ct-log/${next}`);
      if (detailRef.current) {
        if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = setTimeout(() => {
          detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 50);
      }
    } else {
      const si = startRef.current;
      const ps = pageSizeRef.current;
      if (si !== null) {
        replaceUrl(buildListUrl(si, ps));
      } else {
        replaceUrl("/ct-log");
      }
    }
  }, []);

  const selectedEntry = useMemo(() => entries.find((e) => e.index === selectedIndex) ?? null, [entries, selectedIndex]);
  const treeSize = sth?.tree_size ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">CT Log Viewer</h1>
        <p className="text-sm text-muted-foreground">
          Browse raw Certificate Transparency log entries from the Gorgon CT log.
        </p>
      </div>

      <STHPanel sth={sth} loading={sthLoading} />

      {startIndex !== null && (
        <EntryNavigator
          startIndex={startIndex}
          pageSize={pageSize}
          treeSize={treeSize}
          onNavigate={handleNavigate}
          onPageSizeChange={handlePageSizeChange}
          jumpInputRef={jumpInputRef}
        />
      )}

      {error && (
        <Card className="border-destructive" role="alert">
          <CardContent className="pt-6 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EntryList entries={entries} selectedIndex={selectedIndex} onSelect={handleSelect} loading={loading} />

        <div
          ref={detailRef}
          className="lg:sticky lg:top-16 lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto"
        >
          {selectedEntry ? (
            <EntryDetail entry={selectedEntry} />
          ) : (
            <Card className="h-fit">
              <CardContent>
                <p className="text-sm text-muted-foreground text-center py-8">Select an entry to view details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {startIndex !== null && (
        <EntryNavigator
          startIndex={startIndex}
          pageSize={pageSize}
          treeSize={treeSize}
          onNavigate={handleNavigate}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </div>
  );
}
