"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EntryList } from "@/components/ct-log/entry-list";
import { EntryNavigator } from "@/components/ct-log/entry-navigator";
import { STHPanel, type STHResponse } from "@/components/ct-log/sth-panel";
import { Card, CardContent } from "@/components/ui/card";
import type { DecodedCTEntry } from "@/lib/ct/decode-entry";

const DEFAULT_PAGE_SIZE = 25;
const STH_POLL_INTERVAL = 60_000;

interface EntriesResponse {
  entries: DecodedCTEntry[];
  range: { start: number; end: number; treeSize: number };
}

export function CTLogContent() {
  const [sth, setSTH] = useState<STHResponse | null>(null);
  const [sthLoading, setSTHLoading] = useState(true);
  const [entries, setEntries] = useState<DecodedCTEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [startIndex, setStartIndex] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detailRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

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

  // Fetch entries for a given start index
  const fetchEntries = useCallback(async (start: number, size: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ct-log/entries?start=${start}&count=${size}`);
      if (!res.ok) throw new Error("Failed to fetch entries");
      const data: EntriesResponse = await res.json();
      setEntries(data.entries);
    } catch {
      setError("Failed to fetch CT log entries");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load: fetch STH, then jump to latest entries
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    fetchSTH().then((data) => {
      if (data) {
        const start = Math.max(0, data.tree_size - DEFAULT_PAGE_SIZE);
        setStartIndex(start);
      }
    });
  }, [fetchSTH]);

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

  // Navigate to a new start index
  function handleNavigate(newStart: number) {
    setStartIndex(newStart);
    setSelectedIndex(null);
  }

  // Change page size, keeping current start index stable
  function handlePageSizeChange(size: number) {
    setPageSize(size);
  }

  // Select an entry and scroll detail into view on mobile
  function handleSelect(index: number) {
    setSelectedIndex(index === selectedIndex ? null : index);
    if (index !== selectedIndex && detailRef.current) {
      setTimeout(() => {
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);
    }
  }

  const selectedEntry = entries.find((e) => e.index === selectedIndex) ?? null;
  const treeSize = sth?.tree_size ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">CT Log Viewer</h1>
        <p className="text-muted-foreground">Browse raw Certificate Transparency log entries from the Gorgon CT log.</p>
      </div>

      <STHPanel sth={sth} loading={sthLoading} />

      {startIndex !== null && (
        <EntryNavigator
          startIndex={startIndex}
          pageSize={pageSize}
          treeSize={treeSize}
          onNavigate={handleNavigate}
          onPageSizeChange={handlePageSizeChange}
        />
      )}

      {error && (
        <Card className="border-destructive" role="alert">
          <CardContent className="pt-6 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
        <EntryList entries={entries} selectedIndex={selectedIndex} onSelect={handleSelect} loading={loading} />

        {/* Detail panel placeholder (Task 3 will replace this) */}
        <div ref={detailRef}>
          <Card className="h-fit">
            <CardContent className="pt-6">
              {selectedEntry ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Entry #{selectedEntry.index.toLocaleString()}</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                    <dt className="text-muted-foreground">Type</dt>
                    <dd>{selectedEntry.leaf.entryType === "x509_entry" ? "X.509" : "Precert"}</dd>
                    <dt className="text-muted-foreground">Subject</dt>
                    <dd className="truncate">{selectedEntry.cert?.subject ?? "Unknown"}</dd>
                    <dt className="text-muted-foreground">Issuer</dt>
                    <dd className="truncate">{selectedEntry.cert?.issuer ?? "Unknown"}</dd>
                    <dt className="text-muted-foreground">Timestamp</dt>
                    <dd className="tabular-nums">{selectedEntry.leaf.timestampDate}</dd>
                    {selectedEntry.cert?.isBIMI && (
                      <>
                        <dt className="text-muted-foreground">BIMI</dt>
                        <dd className="text-emerald-500 font-medium">Yes</dd>
                      </>
                    )}
                  </dl>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Select an entry to view details</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
