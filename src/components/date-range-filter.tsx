"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

function formatDateISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface DatePresetEntry {
  label: string;
  from: string;
  to: string;
  group: "rolling" | "calendar";
}

export function computeDatePresets(direction: "past" | "future"): DatePresetEntry[] {
  const now = new Date();
  const year = now.getFullYear();

  const rollingLabels =
    direction === "past"
      ? ["Last 30d", "Last 90d", "Last 6mo", "Last year"]
      : ["Next 30d", "Next 90d", "Next 6mo", "Next year"];
  const offsets = [30, 90, 180, 365];
  const rolling: DatePresetEntry[] = rollingLabels.map((label, i) => {
    const d = new Date(now);
    if (direction === "past") {
      d.setDate(d.getDate() - offsets[i]);
      return { label, from: formatDateISO(d), to: formatDateISO(now), group: "rolling" };
    }
    d.setDate(d.getDate() + offsets[i]);
    return { label, from: formatDateISO(now), to: formatDateISO(d), group: "rolling" };
  });

  const calendar: DatePresetEntry[] =
    direction === "past"
      ? [
          {
            label: "Last month",
            from: formatDateISO(new Date(year, now.getMonth() - 1, 1)),
            to: formatDateISO(new Date(year, now.getMonth(), 0)),
            group: "calendar",
          },
          {
            label: "This month",
            from: formatDateISO(new Date(year, now.getMonth(), 1)),
            to: formatDateISO(now),
            group: "calendar",
          },
          {
            label: `${year - 1}`,
            from: `${year - 1}-01-01`,
            to: `${year - 1}-12-31`,
            group: "calendar",
          },
          {
            label: `${year}`,
            from: `${year}-01-01`,
            to: formatDateISO(now),
            group: "calendar",
          },
        ]
      : [
          {
            label: "This month",
            from: formatDateISO(now),
            to: formatDateISO(new Date(year, now.getMonth() + 1, 0)),
            group: "calendar",
          },
          {
            label: "Next month",
            from: formatDateISO(new Date(year, now.getMonth() + 1, 1)),
            to: formatDateISO(new Date(year, now.getMonth() + 2, 0)),
            group: "calendar",
          },
          {
            label: `${year}`,
            from: formatDateISO(now),
            to: `${year}-12-31`,
            group: "calendar",
          },
          {
            label: `${year + 1}`,
            from: `${year + 1}-01-01`,
            to: `${year + 1}-12-31`,
            group: "calendar",
          },
        ];

  return [...rolling, ...calendar];
}

function datesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diff <= 86400000;
}

function DatePresets({
  direction,
  currentFrom,
  currentTo,
  fromKey,
  toKey,
  onSelect,
}: {
  direction: "past" | "future";
  currentFrom: string;
  currentTo: string;
  fromKey: string;
  toKey: string;
  onSelect: (updates: Record<string, string | null>) => void;
}) {
  const presets = computeDatePresets(direction);
  const isCustom =
    currentFrom && currentTo && !presets.some((p) => datesMatch(p.from, currentFrom) && datesMatch(p.to, currentTo));
  const hasAny = currentFrom || currentTo;

  const rolling = presets.filter((p) => p.group === "rolling");
  const calendar = presets.filter((p) => p.group === "calendar");

  const presetButton = (p: DatePresetEntry) => {
    const active = datesMatch(p.from, currentFrom) && datesMatch(p.to, currentTo);
    return (
      <button
        key={p.label}
        type="button"
        onClick={() => onSelect({ [fromKey]: p.from, [toKey]: p.to })}
        className={`px-1.5 py-0.5 rounded text-[11px] transition-colors ${
          active ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted-foreground/20 text-muted-foreground"
        }`}
      >
        {p.label}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {rolling.map(presetButton)}
      <span className="text-[11px] text-muted-foreground/40 select-none">·</span>
      {calendar.map(presetButton)}
      {isCustom && <span className="px-1.5 py-0.5 rounded text-[11px] bg-primary text-primary-foreground">Custom</span>}
      {hasAny && (
        <button
          type="button"
          onClick={() => onSelect({ [fromKey]: null, [toKey]: null })}
          className="px-1 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

export function DateRangeFilter({
  currentFrom,
  currentTo,
  fromKey,
  toKey,
  fromLabel,
  toLabel,
  direction,
  onCommit,
  onMultiUpdate,
  fullWidth,
}: {
  currentFrom: string;
  currentTo: string;
  fromKey: string;
  toKey: string;
  fromLabel: string;
  toLabel: string;
  direction: "past" | "future";
  onCommit: (key: string, value: string) => void;
  onMultiUpdate: (updates: Record<string, string | null>) => void;
  fullWidth?: boolean;
}) {
  const [localFrom, setLocalFrom] = useState(currentFrom);
  const [localTo, setLocalTo] = useState(currentTo);

  useEffect(() => {
    setLocalFrom(currentFrom);
  }, [currentFrom]);
  useEffect(() => {
    setLocalTo(currentTo);
  }, [currentTo]);

  return (
    <div className="flex flex-col gap-1.5">
      <DatePresets
        direction={direction}
        currentFrom={currentFrom}
        currentTo={currentTo}
        fromKey={fromKey}
        toKey={toKey}
        onSelect={onMultiUpdate}
      />
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={localFrom}
          onChange={(e) => setLocalFrom(e.target.value)}
          onBlur={(e) => onCommit(fromKey, e.target.value)}
          aria-label={fromLabel}
          className={fullWidth ? "h-8 flex-1 text-xs" : "h-8 w-[130px] text-xs"}
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="date"
          value={localTo}
          onChange={(e) => setLocalTo(e.target.value)}
          onBlur={(e) => onCommit(toKey, e.target.value)}
          aria-label={toLabel}
          className={fullWidth ? "h-8 flex-1 text-xs" : "h-8 w-[130px] text-xs"}
        />
      </div>
    </div>
  );
}
