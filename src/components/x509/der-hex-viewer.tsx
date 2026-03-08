"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

interface DerHexViewerProps {
  bytes: Uint8Array;
  highlightRange?: { start: number; end: number; headerEnd: number } | null;
  onByteClick?: (offset: number) => void;
  className?: string;
}

const BYTES_PER_ROW = 16;

interface RowData {
  offset: number;
  bytes: number[];
}

type HighlightKind = "header" | "value" | null;

function isPrintable(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x7e;
}

/**
 * Determine highlight kind for a byte at a given offset.
 */
function getHighlight(
  offset: number,
  range: { start: number; end: number; headerEnd: number } | null | undefined,
): HighlightKind {
  if (!range) return null;
  if (offset >= range.start && offset < range.headerEnd) return "header";
  if (offset >= range.headerEnd && offset < range.end) return "value";
  return null;
}

const HIGHLIGHT_CLASSES: Record<string, string> = {
  header: "bg-amber-500/30 dark:bg-amber-400/20",
  value: "bg-blue-500/30 dark:bg-blue-400/20",
};

export function DerHexViewer({ bytes, highlightRange, onByteClick, className }: DerHexViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightStartRef = useRef<HTMLSpanElement>(null);

  // Build row data
  const rows = useMemo<RowData[]>(() => {
    const result: RowData[] = [];
    for (let i = 0; i < bytes.length; i += BYTES_PER_ROW) {
      const rowBytes: number[] = [];
      for (let j = i; j < i + BYTES_PER_ROW && j < bytes.length; j++) {
        rowBytes.push(bytes[j]);
      }
      result.push({ offset: i, bytes: rowBytes });
    }
    return result;
  }, [bytes]);

  // Auto-scroll to the first highlighted byte when the range changes
  useEffect(() => {
    if (highlightRange && highlightStartRef.current) {
      highlightStartRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [highlightRange]);

  return (
    <div
      ref={containerRef}
      className={cn("font-mono text-xs overflow-auto bg-muted/30 rounded-md p-2", className)}
      role="region"
      aria-label="DER hex dump"
    >
      {rows.map((row) => {
        const rowOffset = row.offset;
        return (
          <div key={rowOffset} className="flex leading-5" style={{ height: 20 }}>
            {/* Offset address */}
            <span className="text-muted-foreground select-none shrink-0 w-[9ch]">
              {rowOffset.toString(16).padStart(8, "0")}
              {"  "}
            </span>

            {/* Hex byte pairs */}
            <span className="shrink-0" style={{ width: `${BYTES_PER_ROW * 3 + 1}ch` }}>
              {row.bytes.map((byte, i) => {
                const absOffset = rowOffset + i;
                const hl = getHighlight(absOffset, highlightRange);
                const isHighlightStart = highlightRange && absOffset === highlightRange.start;
                return (
                  <span
                    key={absOffset}
                    ref={isHighlightStart ? highlightStartRef : undefined}
                    className={cn(onByteClick && "cursor-pointer", hl && HIGHLIGHT_CLASSES[hl])}
                    onClick={onByteClick ? () => onByteClick(absOffset) : undefined}
                  >
                    {byte.toString(16).padStart(2, "0")}
                    {/* Extra space after byte 8 for visual grouping */}
                    {i === 7 ? "  " : i < row.bytes.length - 1 ? " " : ""}
                  </span>
                );
              })}
              {/* Pad the last row if it's short */}
              {row.bytes.length < BYTES_PER_ROW && (
                <span>
                  {row.bytes.length <= 7
                    ? " ".repeat((BYTES_PER_ROW - row.bytes.length) * 3 + 1)
                    : " ".repeat((BYTES_PER_ROW - row.bytes.length) * 3)}
                </span>
              )}
            </span>

            {/* Separator */}
            <span className="text-muted-foreground/40 select-none mx-0.5">|</span>

            {/* ASCII representation */}
            <span className="text-muted-foreground/70">
              {row.bytes.map((byte, i) => {
                const absOffset = rowOffset + i;
                const hl = getHighlight(absOffset, highlightRange);
                return (
                  <span
                    key={absOffset}
                    className={cn(hl && HIGHLIGHT_CLASSES[hl])}
                    onClick={onByteClick ? () => onByteClick(absOffset) : undefined}
                  >
                    {isPrintable(byte) ? String.fromCharCode(byte) : "."}
                  </span>
                );
              })}
            </span>
            <span className="text-muted-foreground/40 select-none">|</span>
          </div>
        );
      })}
    </div>
  );
}
