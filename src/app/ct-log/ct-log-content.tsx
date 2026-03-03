"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EntryDetail } from "@/components/ct-log/entry-detail";
import { EntryList } from "@/components/ct-log/entry-list";
import { EntryNavigator } from "@/components/ct-log/entry-navigator";
import { STHPanel, type STHResponse } from "@/components/ct-log/sth-panel";
import { Card, CardContent } from "@/components/ui/card";
import type { DecodedCTEntry } from "@/lib/ct/decode-entry";

const DEFAULT_PAGE_SIZE = 100;
const STH_POLL_INTERVAL = 60_000;

interface EntriesResponse {
  entries: DecodedCTEntry[];
  range: { start: number; end: number; treeSize: number };
}

export function CTLogContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [sth, setSTH] = useState<STHResponse | null>(null);
  const [sthLoading, setSTHLoading] = useState(true);
  const [entries, setEntries] = useState<DecodedCTEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [startIndex, setStartIndex] = useState<number | null>(() => {
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
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detailRef = useRef<HTMLDivElement>(null);
  const jumpInputRef = useRef<HTMLInputElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Initial load: fetch STH, then jump to latest entries (unless URL has start)
  useEffect(() => {
    fetchSTH().then((data) => {
      if (data && startIndex === null) {
        const start = Math.max(0, data.tree_size - pageSize);
        setStartIndex(start);
        updateUrl(start, pageSize);
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

  // Sync URL with state
  const updateUrl = useCallback(
    (start: number, count: number) => {
      const params = new URLSearchParams();
      params.set("start", String(start));
      if (count !== DEFAULT_PAGE_SIZE) params.set("count", String(count));
      router.replace(`${pathname}?${params}`, { scroll: false });
    },
    [router, pathname],
  );

  // Navigate to a new start index
  const handleNavigate = useCallback(
    (newStart: number) => {
      setStartIndex(newStart);
      setSelectedIndex(null);
      updateUrl(newStart, pageSize);
    },
    [updateUrl, pageSize],
  );

  // Change page size, keeping current start index stable
  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPageSize(size);
      if (startIndex !== null) updateUrl(startIndex, size);
    },
    [updateUrl, startIndex],
  );

  // Select an entry and scroll detail into view on mobile
  const handleSelect = useCallback((index: number) => {
    setSelectedIndex((prev) => {
      const next = index === prev ? null : index;
      if (next !== null && detailRef.current) {
        if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = setTimeout(() => {
          detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 50);
      }
      return next;
    });
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
