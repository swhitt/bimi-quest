"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EntryDetail } from "@/components/ct-log/entry-detail";
import { EntryList } from "@/components/ct-log/entry-list";
import { EntryNavigator } from "@/components/ct-log/entry-navigator";
import { STHPanel, type STHResponse } from "@/components/ct-log/sth-panel";
import { Card, CardContent } from "@/components/ui/card";
import type { DecodedCTEntry } from "@/lib/ct/decode-entry";
import { DEFAULT_PAGE_SIZE, toPageNumber } from "./constants";
const STH_POLL_INTERVAL = 15_000;

/** Update browser URL without triggering Next.js navigation or component remount */
function replaceUrl(url: string) {
  window.history.replaceState(window.history.state, "", url);
}

interface EntriesResponse {
  entries: DecodedCTEntry[];
  range: { start: number; end: number; treeSize: number };
}

interface CTLogContentProps {
  logSlug: string;
  permalinkedIndex?: number;
  initialStart?: number;
  initialPageSize?: number;
}

export function CTLogContent({ logSlug, permalinkedIndex, initialStart, initialPageSize }: CTLogContentProps) {
  const basePath = `/ct/${logSlug}`;
  const apiBase = `/api/ct/${logSlug}`;

  const buildListUrl = useCallback(
    (start: number, count: number): string => {
      const pageNum = toPageNumber(start, count);
      const params = new URLSearchParams();
      params.set("start", String(start));
      if (count !== DEFAULT_PAGE_SIZE) params.set("count", String(count));
      return `${basePath}/page/${pageNum}?${params}`;
    },
    [basePath],
  );

  const [sth, setSTH] = useState<STHResponse | null>(null);
  const [sthLoading, setSTHLoading] = useState(true);
  const [lastPolled, setLastPolled] = useState<number | null>(null);
  const [entries, setEntries] = useState<DecodedCTEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [startIndex, setStartIndex] = useState<number | null>(() => {
    if (permalinkedIndex !== undefined) {
      return Math.max(0, permalinkedIndex - Math.floor(DEFAULT_PAGE_SIZE / 2));
    }
    return initialStart ?? null;
  });
  const [pageSize, setPageSize] = useState(() => {
    return initialPageSize ?? DEFAULT_PAGE_SIZE;
  });
  const [selectedIndex, setSelectedIndex] = useState<number | null>(permalinkedIndex ?? null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [newEntryCount, setNewEntryCount] = useState(0);

  const detailRef = useRef<HTMLDivElement>(null);
  const jumpInputRef = useRef<HTMLInputElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for stable callbacks
  const selectedRef = useRef<number | null>(selectedIndex);
  const startRef = useRef<number | null>(startIndex);
  const pageSizeRef = useRef(pageSize);
  const prevTreeSizeRef = useRef(0);
  const isAtLiveEdgeRef = useRef(permalinkedIndex === undefined && initialStart === undefined);
  selectedRef.current = selectedIndex;
  startRef.current = startIndex;
  pageSizeRef.current = pageSize;

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key === "g") {
        e.preventDefault();
        jumpInputRef.current?.focus();
        return;
      }

      if (isInput) return;

      // Page navigation shortcuts
      if (e.key === "[" || e.key === "ArrowLeft") {
        e.preventDefault();
        const si = startRef.current;
        if (si !== null && si > 0) {
          handleNavigate(Math.max(0, si - pageSizeRef.current));
        }
      } else if (e.key === "]" || e.key === "ArrowRight") {
        e.preventDefault();
        const si = startRef.current;
        const ts = prevTreeSizeRef.current;
        if (si !== null && si + pageSizeRef.current < ts) {
          handleNavigate(Math.min(si + pageSizeRef.current, Math.max(0, ts - pageSizeRef.current)));
        }
      } else if (e.key === "Escape" && selectedRef.current !== null) {
        setSelectedIndex(null);
        const si = startRef.current;
        const ps = pageSizeRef.current;
        if (si !== null) replaceUrl(buildListUrl(si, ps));
        else replaceUrl(basePath);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch STH
  const fetchGenRef = useRef(0);

  const fetchSTH = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/sth`);
      if (!res.ok) throw new Error("Failed to fetch STH");
      const data: STHResponse = await res.json();
      setSTH(data);
      setLastPolled(Date.now());

      // Auto-advance if at live edge
      const prev = prevTreeSizeRef.current;
      prevTreeSizeRef.current = data.tree_size;

      if (prev > 0 && data.tree_size > prev && isAtLiveEdgeRef.current) {
        const si = startRef.current;
        const ps = pageSizeRef.current;
        if (si !== null && si + ps >= prev) {
          // At the live edge — auto-advance
          const newStart = Math.max(0, data.tree_size - ps);
          setStartIndex(newStart);
          startRef.current = newStart;
          replaceUrl(buildListUrl(newStart, ps));
        } else {
          // User has scrolled away — show banner instead
          setNewEntryCount((n) => n + (data.tree_size - prev));
        }
      }

      return data;
    } catch {
      setError("Failed to fetch Signed Tree Head");
      return null;
    } finally {
      setSTHLoading(false);
    }
  }, [apiBase, buildListUrl]);

  const abortRef = useRef<AbortController | null>(null);

  // Fetch entries with generation counter to prevent stale updates
  const fetchEntries = useCallback(
    async (start: number, size: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const gen = ++fetchGenRef.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/entries?start=${start}&count=${size}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Failed to fetch entries");
        const data: EntriesResponse = await res.json();
        if (gen !== fetchGenRef.current) return;
        setEntries(data.entries);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (gen !== fetchGenRef.current) return;
        setError("Failed to fetch CT log entries");
        setEntries([]);
      } finally {
        if (gen === fetchGenRef.current) setLoading(false);
      }
    },
    [apiBase],
  );

  // Initial load: fetch STH, then jump to latest entries (unless URL has start or permalink)
  useEffect(() => {
    fetchSTH().then((data) => {
      if (data && startIndex === null) {
        const start = Math.max(0, data.tree_size - pageSize);
        setStartIndex(start);
        isAtLiveEdgeRef.current = true;
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
    return () => {
      abortRef.current?.abort();
    };
  }, [startIndex, pageSize, fetchEntries]);

  // Auto-scroll entry row to center of viewport when a permalinked entry loads
  useEffect(() => {
    if (permalinkedIndex === undefined) return;
    if (selectedIndex !== permalinkedIndex) return;
    if (!entries.some((e) => e.index === permalinkedIndex)) return;
    const row = document.querySelector(`[data-entry-index="${permalinkedIndex}"]`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [permalinkedIndex, selectedIndex, entries]);

  // Navigate to a new start index (clears selection, updates URL)
  const handleNavigate = useCallback(
    (newStart: number) => {
      setStartIndex(newStart);
      setSelectedIndex(null);
      setNewEntryCount(0);
      // Track if we're at the live edge
      const ts = prevTreeSizeRef.current;
      isAtLiveEdgeRef.current = ts > 0 && newStart + pageSizeRef.current >= ts;
      replaceUrl(buildListUrl(newStart, pageSizeRef.current));
    },
    [buildListUrl],
  );

  // Jump to live edge
  const handleJumpToLive = useCallback(() => {
    const ts = prevTreeSizeRef.current;
    if (ts <= 0) return;
    const newStart = Math.max(0, ts - pageSizeRef.current);
    setStartIndex(newStart);
    setSelectedIndex(null);
    setNewEntryCount(0);
    isAtLiveEdgeRef.current = true;
    replaceUrl(buildListUrl(newStart, pageSizeRef.current));
  }, [buildListUrl]);

  // Change page size
  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPageSize(size);
      const si = startRef.current;
      if (selectedRef.current !== null) return;
      if (si !== null) {
        replaceUrl(buildListUrl(si, size));
      }
    },
    [buildListUrl],
  );

  // Select/deselect an entry (updates URL to entry permalink or list view)
  const handleSelect = useCallback(
    (index: number) => {
      const prev = selectedRef.current;
      const next = index === prev ? null : index;
      setSelectedIndex(next);

      if (next !== null) {
        replaceUrl(`${basePath}/${next}`);
        if (detailRef.current) {
          if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
          scrollTimerRef.current = setTimeout(() => {
            detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 50);
        }
      } else {
        const si = startRef.current;
        const ps = pageSizeRef.current;
        if (si !== null) {
          replaceUrl(buildListUrl(si, ps));
        } else {
          replaceUrl(basePath);
        }
      }
    },
    [basePath, buildListUrl],
  );

  const selectedEntry = useMemo(() => entries.find((e) => e.index === selectedIndex) ?? null, [entries, selectedIndex]);
  const treeSize = sth?.tree_size ?? 0;

  return (
    <div className="space-y-4">
      <STHPanel sth={sth} loading={sthLoading} lastPolled={lastPolled} />

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
        <EntryList
          entries={entries}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
          loading={loading}
          newEntryCount={newEntryCount}
          onJumpToLive={handleJumpToLive}
        />

        <div
          ref={detailRef}
          className="lg:sticky lg:top-16 lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto"
        >
          {selectedEntry ? (
            <EntryDetail entry={selectedEntry} activeTab={activeTab} onTabChange={setActiveTab} />
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
