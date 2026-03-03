"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hexToBytes } from "@/lib/hex";
import { BYTE_COLORS, type ByteRange } from "@/lib/ct/decode-entry";

interface HexViewerProps {
  data: string;
  byteMap: ByteRange[];
}

function isPrintable(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x7e;
}

// Pre-compute a lookup array: byteIndex -> byteMap index (or -1)
function buildRangeIndex(byteMap: ByteRange[], totalBytes: number): Int16Array {
  const index = new Int16Array(totalBytes).fill(-1);
  for (let r = 0; r < byteMap.length; r++) {
    const range = byteMap[r];
    for (let i = range.start; i < range.end && i < totalBytes; i++) {
      index[i] = r;
    }
  }
  return index;
}

export function HexViewer({ data, byteMap }: HexViewerProps) {
  const [bytesPerRow, setBytesPerRow] = useState(16);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; range: ByteRange } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dumpRef = useRef<HTMLDivElement>(null);
  const hoveredRangeRef = useRef(-1);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Responsive: 8 bytes on narrow, 16 on wide
  useEffect(() => {
    function check() {
      const w = containerRef.current?.offsetWidth ?? 800;
      setBytesPerRow(w < 640 ? 8 : 16);
    }
    check();
    const observer = new ResizeObserver(check);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const bytes = useMemo(() => hexToBytes(data), [data]);

  const rangeIndex = useMemo(() => buildRangeIndex(byteMap, bytes.length), [byteMap, bytes.length]);

  // Toggle highlight class on DOM elements directly to avoid re-rendering the entire hex dump
  const updateHighlight = useCallback((newRangeIdx: number) => {
    const prevIdx = hoveredRangeRef.current;
    if (prevIdx === newRangeIdx) return;

    const container = dumpRef.current;
    if (container) {
      if (prevIdx >= 0) {
        for (const el of container.querySelectorAll(`[data-range="${prevIdx}"]`)) {
          el.classList.remove("hex-hl", "hex-hl-ascii");
        }
      }
      if (newRangeIdx >= 0) {
        for (const el of container.querySelectorAll(`[data-range="${newRangeIdx}"]`)) {
          el.classList.add(el.classList.contains("hex-ascii") ? "hex-hl-ascii" : "hex-hl");
        }
      }
    }
    hoveredRangeRef.current = newRangeIdx;
  }, []);

  // Single event handler on the container using data attributes
  function handleMouseOver(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    const byteIdx = target.dataset.byte;
    if (byteIdx === undefined) return;
    const idx = parseInt(byteIdx, 10);
    const rIdx = rangeIndex[idx];
    if (rIdx >= 0) {
      updateHighlight(rIdx);
      const rect = target.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect) {
        setTooltip({
          x: rect.left - containerRect.left + rect.width / 2,
          y: rect.top - containerRect.top - 4,
          range: byteMap[rIdx],
        });
      }
    } else {
      updateHighlight(-1);
      setTooltip(null);
    }
  }

  function handleMouseLeave() {
    updateHighlight(-1);
    setTooltip(null);
  }

  function scrollToRange(range: ByteRange, rangeIdx: number) {
    const rowIndex = Math.floor(range.start / bytesPerRow);
    const el = dumpRef.current?.children[rowIndex] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    updateHighlight(rangeIdx);
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => updateHighlight(-1), 2000);
  }

  // Clean up scroll timer on unmount
  useEffect(
    () => () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    },
    [],
  );

  // Pre-build row data with per-byte cell info computed once
  const rows = useMemo(() => {
    const result: {
      offset: number;
      cells: { byte: number; absoluteIdx: number; color: string | undefined; rIdx: number }[];
    }[] = [];
    for (let i = 0; i < bytes.length; i += bytesPerRow) {
      const rowBytes = bytes.subarray(i, i + bytesPerRow);
      const cells = Array.from(rowBytes, (byte, byteIdx) => {
        const absoluteIdx = i + byteIdx;
        const rIdx = rangeIndex[absoluteIdx];
        const color = rIdx >= 0 ? BYTE_COLORS[byteMap[rIdx].color] : undefined;
        return { byte, absoluteIdx, color, rIdx };
      });
      result.push({ offset: i, cells });
    }
    return result;
  }, [bytes, bytesPerRow, rangeIndex, byteMap]);

  return (
    <div ref={containerRef} className="relative space-y-2">
      {/* Inline styles for highlight classes (avoids global CSS dependency) */}
      <style>{`
        .hex-hl { font-weight: 700; text-shadow: 0 0 6px var(--range-color); }
        .hex-hl-ascii { font-weight: 700; color: var(--range-color) !important; }
      `}</style>

      {/* Hex dump area - single event delegation handler */}
      <div
        className="bg-muted/30 rounded-md p-2 overflow-x-auto"
        onMouseOver={handleMouseOver}
        onMouseLeave={handleMouseLeave}
      >
        <div ref={dumpRef} className="font-mono text-xs leading-[1.6]">
          {rows.map(({ offset, cells }) => (
            <div key={offset} className="flex">
              {/* Offset */}
              <span className="text-muted-foreground select-none w-[7ch] shrink-0">
                {offset.toString(16).padStart(8, "0")}
              </span>
              <span className="text-muted-foreground/40 select-none mx-1">|</span>

              {/* Hex bytes */}
              <span className="shrink-0" style={{ width: `${bytesPerRow * 3}ch` }}>
                {cells.map(({ byte, absoluteIdx, color, rIdx }, i) => (
                  <span
                    key={absoluteIdx}
                    data-byte={absoluteIdx}
                    data-range={rIdx >= 0 ? rIdx : undefined}
                    className="cursor-help"
                    style={{ color: color ?? undefined, "--range-color": color } as React.CSSProperties}
                  >
                    {byte.toString(16).padStart(2, "0")}
                    {i < cells.length - 1 ? " " : ""}
                  </span>
                ))}
                {/* Pad short last row */}
                {cells.length < bytesPerRow && <span>{" ".repeat((bytesPerRow - cells.length) * 3)}</span>}
              </span>

              <span className="text-muted-foreground/40 select-none mx-1">|</span>

              {/* ASCII */}
              <span className="text-muted-foreground/70">
                {cells.map(({ byte, absoluteIdx, rIdx }) => (
                  <span
                    key={absoluteIdx}
                    data-byte={absoluteIdx}
                    data-range={rIdx >= 0 ? rIdx : undefined}
                    className="hex-ascii"
                    style={
                      {
                        "--range-color": rIdx >= 0 ? BYTE_COLORS[byteMap[rIdx].color] : undefined,
                      } as React.CSSProperties
                    }
                  >
                    {isPrintable(byte) ? String.fromCharCode(byte) : "."}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Floating tooltip - single instance, positioned via state */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none animate-in fade-in-0 zoom-in-95 duration-100"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="bg-popover text-popover-foreground border rounded-md shadow-md px-3 py-2 text-xs max-w-72">
            <p className="font-semibold" style={{ color: BYTE_COLORS[tooltip.range.color] }}>
              {tooltip.range.label}
            </p>
            <p className="font-mono text-[10px] break-all">{tooltip.range.value}</p>
            <p className="text-muted-foreground">{tooltip.range.description}</p>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {byteMap.map((range, i) => (
          <button
            key={`${range.start}-${range.label}`}
            type="button"
            onClick={() => scrollToRange(range, i)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label={`Scroll to ${range.label} region`}
          >
            <span
              className="inline-block size-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: BYTE_COLORS[range.color] }}
            />
            {range.label}
          </button>
        ))}
      </div>
    </div>
  );
}
