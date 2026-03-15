"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { HeatmapCell, HeatmapMetric } from "@/lib/data/stats";
import { useGlobalFilters } from "@/lib/use-global-filters";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const TIMEZONE_OPTIONS = [
  { label: "UTC", offset: 0 },
  { label: "US Eastern", offset: -5 },
  { label: "US Pacific", offset: -8 },
  { label: "Central EU", offset: 1 },
  { label: "India", offset: 5.5 },
  { label: "Japan", offset: 9 },
] as const;

const COLORS = {
  light: [
    "oklch(0.97 0 0)",
    "oklch(0.90 0.04 185)",
    "oklch(0.78 0.08 185)",
    "oklch(0.66 0.11 185)",
    "oklch(0.55 0.15 185)",
  ],
  dark: [
    "oklch(0.20 0 0)",
    "oklch(0.28 0.03 185)",
    "oklch(0.40 0.08 185)",
    "oklch(0.55 0.12 185)",
    "oklch(0.70 0.14 185)",
  ],
} as const;

function isDarkMode(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

function computeBuckets(cells: HeatmapCell[]): (count: number) => number {
  const nonZero = cells.map((c) => c.count).filter((v) => v > 0);
  if (nonZero.length === 0) return () => 0;

  nonZero.sort((a, b) => a - b);
  const pct = (p: number) => nonZero[Math.min(Math.floor((p / 100) * nonZero.length), nonZero.length - 1)];
  const breakpoints = [pct(25), pct(50), pct(75), pct(100)];

  return (count: number) => {
    if (count === 0) return 0;
    if (count <= breakpoints[0]) return 1;
    if (count <= breakpoints[1]) return 2;
    if (count <= breakpoints[2]) return 3;
    return 4;
  };
}

function buildGrid(cells: HeatmapCell[], tzOffset: number): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0) as number[]);
  for (const { dow, hour, count } of cells) {
    let shiftedHour = hour + tzOffset;
    let shiftedDow = dow;
    // Handle half-hour offsets by rounding (data is hourly buckets)
    shiftedHour = Math.round(shiftedHour);
    if (shiftedHour < 0) {
      shiftedHour += 24;
      shiftedDow -= 1;
      if (shiftedDow < 1) shiftedDow = 7;
    } else if (shiftedHour >= 24) {
      shiftedHour -= 24;
      shiftedDow += 1;
      if (shiftedDow > 7) shiftedDow = 1;
    }
    grid[shiftedDow - 1][shiftedHour] += count;
  }
  return grid;
}

function formatTzLabel(opt: (typeof TIMEZONE_OPTIONS)[number]): string {
  if (opt.offset === 0) return opt.label;
  const sign = opt.offset >= 0 ? "+" : "";
  const hours = Math.trunc(opt.offset);
  const minutes = Math.abs(opt.offset % 1) * 60;
  const offsetStr = minutes > 0 ? `${sign}${hours}:${String(minutes).padStart(2, "0")}` : `${sign}${hours}`;
  return `${opt.label} (${offsetStr})`;
}

/** Convert display-local DOW/hour back to UTC for the query params. */
function toUtcDowHour(displayDow: number, displayHour: number, tzOffset: number) {
  let hour = Math.round(displayHour - tzOffset);
  let dow = displayDow;
  if (hour < 0) {
    hour += 24;
    dow = dow <= 1 ? 7 : dow - 1;
  } else if (hour >= 24) {
    hour -= 24;
    dow = dow >= 7 ? 1 : dow + 1;
  }
  return { dow, hour };
}

export function CertHeatmap({ initialData }: { initialData?: HeatmapCell[] }) {
  const [metric, setMetric] = useState<HeatmapMetric>("issuance");
  const [tzOffset, setTzOffset] = useState(0);
  const [cells, setCells] = useState<HeatmapCell[]>(initialData ?? []);
  const [loading, setLoading] = useState(!initialData);
  const router = useRouter();
  const { buildApiParams } = useGlobalFilters();
  const loadedRef = useRef<string | null>(null);
  const hasInitialData = useRef(!!initialData);

  const fetchGenRef = useRef(0);

  useEffect(() => {
    const params = buildApiParams({ metric });

    // Skip initial fetch if we have SSR data for the default metric
    if (hasInitialData.current && metric === "issuance") {
      hasInitialData.current = false;
      loadedRef.current = params;
      return;
    }
    hasInitialData.current = false;

    if (loadedRef.current === params) return;
    const gen = ++fetchGenRef.current;
    const controller = new AbortController();
    fetch(`/api/stats/heatmap?${params}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: { data?: HeatmapCell[] }) => {
        if (gen === fetchGenRef.current) {
          setCells(json.data ?? []);
          loadedRef.current = params;
          setLoading(false);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError" && gen === fetchGenRef.current) {
          setCells([]);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [buildApiParams, metric]);

  const handleCellClick = useCallback(
    (dayIdx: number, hourIdx: number) => {
      const { dow, hour } = toUtcDowHour(dayIdx + 1, hourIdx, tzOffset);
      const timeColVal = metric === "ctlog" ? "ctLogTimestamp" : "notBefore";
      const params = new URLSearchParams();
      params.set("dow", String(dow));
      params.set("hour", String(hour));
      params.set("timeCol", timeColVal);
      router.push(`/certificates?${params}`);
    },
    [router, tzOffset, metric],
  );

  const grid = buildGrid(cells, tzOffset);
  const getBucket = computeBuckets(cells);

  const selectedTz = TIMEZONE_OPTIONS.find((o) => o.offset === tzOffset) ?? TIMEZONE_OPTIONS[0];
  const tzLabel = selectedTz.offset === 0 ? "UTC" : selectedTz.label;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
        <span className="text-[10px] sm:text-xs font-mono uppercase tracking-wider text-muted-foreground">
          issuance activity
        </span>

        <div className="flex rounded-md border border-border text-[10px] font-mono">
          <button
            type="button"
            className={`px-2 py-0.5 rounded-l-md transition-colors ${
              metric === "issuance"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMetric("issuance")}
          >
            issuance
          </button>
          <button
            type="button"
            className={`px-2 py-0.5 rounded-r-md border-l border-border transition-colors ${
              metric === "ctlog" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMetric("ctlog")}
          >
            ct log
          </button>
        </div>

        <select
          value={tzOffset}
          onChange={(e) => setTzOffset(Number(e.target.value))}
          className="bg-transparent border border-border rounded-md px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground cursor-pointer"
        >
          {TIMEZONE_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.offset}>
              {formatTzLabel(opt)}
            </option>
          ))}
        </select>
      </div>

      {loading && cells.length === 0 ? (
        <div className="h-[200px] animate-pulse rounded-md bg-muted" />
      ) : cells.length === 0 ? (
        <div className="flex h-[160px] items-center justify-center text-muted-foreground text-sm">
          No data for current filters.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto scrollbar-thin">
            <TooltipProvider>
              <div
                className="grid gap-[2px] max-w-[720px]"
                style={{
                  gridTemplateColumns: "auto repeat(24, minmax(12px, 1fr))",
                }}
              >
                {/* Hour header row */}
                <div />
                {Array.from({ length: 24 }, (_, h) => (
                  <div
                    key={`h-${h}`}
                    className="text-center text-[8px] lg:text-[10px] font-mono text-muted-foreground leading-tight"
                  >
                    <span className="hidden lg:inline">{String(h).padStart(2, "0")}</span>
                    <span className="lg:hidden">{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>
                  </div>
                ))}

                {/* Day rows */}
                {grid.map((row, dayIdx) => {
                  const dayKey = DAY_LABELS[dayIdx];
                  return (
                    <HeatmapRow
                      key={dayKey}
                      dayLabel={dayKey}
                      dayIdx={dayIdx}
                      row={row}
                      getBucket={getBucket}
                      tzLabel={tzLabel}
                      onCellClick={handleCellClick}
                    />
                  );
                })}
              </div>
            </TooltipProvider>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] font-mono text-muted-foreground">fewer</span>
            <div className="flex gap-[2px] max-w-[200px]">
              {(isDarkMode() ? COLORS.dark : COLORS.light).map((color) => (
                <div key={color} className="h-2.5 flex-1 rounded-sm" style={{ backgroundColor: color }} />
              ))}
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">more</span>
          </div>
        </>
      )}
    </div>
  );
}

/** Renders a single day row (label + 24 cells) to avoid Fragment key warnings */
function HeatmapRow({
  dayLabel,
  dayIdx,
  row,
  getBucket,
  tzLabel,
  onCellClick,
}: {
  dayLabel: string;
  dayIdx: number;
  row: number[];
  getBucket: (count: number) => number;
  tzLabel: string;
  onCellClick: (dayIdx: number, hourIdx: number) => void;
}) {
  const dark = isDarkMode();
  const colors = dark ? COLORS.dark : COLORS.light;

  return (
    <>
      <div className="text-[10px] font-mono text-muted-foreground pr-1 flex items-center justify-end">{dayLabel}</div>
      {row.map((count, hourIdx) => {
        const bucket = getBucket(count);
        const h0 = String(hourIdx).padStart(2, "0");
        const h1 = String((hourIdx + 1) % 24).padStart(2, "0");

        return (
          <Tooltip key={hourIdx}>
            <TooltipTrigger asChild>
              <div
                className="h-4 rounded-sm min-w-[12px] transition-colors cursor-pointer hover:ring-1 hover:ring-foreground/30"
                style={{ backgroundColor: colors[bucket] }}
                onClick={() => onCellClick(dayIdx, hourIdx)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onCellClick(dayIdx, hourIdx);
                }}
                role="button"
                tabIndex={0}
              />
            </TooltipTrigger>
            <TooltipContent side="top">
              <span className="font-mono text-xs">
                {dayLabel} {h0}:00–{h1}:00 {tzLabel}
                <br />
                {count.toLocaleString()} certificate{count !== 1 ? "s" : ""}
              </span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </>
  );
}
