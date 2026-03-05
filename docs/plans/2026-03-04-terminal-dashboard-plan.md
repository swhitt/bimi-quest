# Terminal Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the dashboard into a dense, borderless command center with inline sparklines, fused chart strips, and keyboard shortcuts.

**Architecture:** Strip all Card wrappers from dashboard components, flatten KPIs into a single inline strip with a hand-rolled SVG sparkline, reduce chart heights, fuse the bottom row into a 4-column grid, and add keyboard navigation. A new data function provides the 30-day daily issuance trend for the sparkline.

**Tech Stack:** Next.js App Router, React Server Components, Recharts (existing), hand-rolled SVG sparkline, Tailwind CSS 4.

---

## Task 1: Create the Sparkline Component

**Files:**

- Create: `src/components/dashboard/sparkline.tsx`

**Step 1: Create the sparkline SVG component**

```tsx
// src/components/dashboard/sparkline.tsx
interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({ data, width = 64, height = 18, className }: SparklineProps) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pad = 1; // 1px padding top/bottom

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = pad + ((max - v) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // Area fill: close the path along the bottom edge
  const areaPoints = `${points} ${width},${height} 0,${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
    >
      <polygon
        points={areaPoints}
        className="fill-primary/15"
      />
      <polyline
        points={points}
        fill="none"
        className="stroke-primary"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

**Step 2: Verify it builds**

Run: `cd /Users/swhitt/Code/personal/bimi-quest && bun run build 2>&1 | tail -5`
Expected: Build succeeds (component is created but not yet imported anywhere).

**Step 3: Commit**

```bash
git add src/components/dashboard/sparkline.tsx
git commit -m "Add hand-rolled SVG sparkline component for dashboard KPIs"
```

---

## Task 2: Add Daily Issuance Trend Data Function

**Files:**

- Modify: `src/lib/data/dashboard.ts`
- Modify: `src/app/dashboard-content.tsx`

**Step 1: Add `dailyTrend` to the DashboardData interface and query**

In `src/lib/data/dashboard.ts`:

Add to the `DashboardData` interface:

```ts
dailyTrend: number[];
```

Add a new query to the `Promise.all` in `fetchDashboardData` that returns the last 30 days of daily issuance counts:

```ts
// Daily issuance counts for sparkline (last 30 days)
db
  .select({
    day: sql<string>`to_char(${certificates.notBefore}::date, 'YYYY-MM-DD')`.as("day"),
    count: count(),
  })
  .from(certificates)
  .where(and(...caConditions, gte(certificates.notBefore, thirtyDaysAgo)))
  .groupBy(sql`${certificates.notBefore}::date`)
  .orderBy(sql`${certificates.notBefore}::date`),
```

Destructure the result and build a 30-element array filling in zero-count days:

```ts
// Build 30-element array, filling gaps with 0
const dailyMap = new Map(dailyTrendRows.map((r) => [r.day, r.count]));
const dailyTrend: number[] = [];
for (let i = 29; i >= 0; i--) {
  const d = new Date(now);
  d.setDate(d.getDate() - i);
  const key = d.toISOString().slice(0, 10);
  dailyTrend.push(dailyMap.get(key) ?? 0);
}
```

Add `dailyTrend` to the returned object.

**Step 2: Pass dailyTrend through to KPICards in `src/app/dashboard-content.tsx`**

Add `dailyTrend={data.dailyTrend}` to the `<KPICards>` props.

**Step 3: Build and verify**

Run: `cd /Users/swhitt/Code/personal/bimi-quest && bun run build 2>&1 | tail -10`
Expected: Type error because KPICards doesn't accept `dailyTrend` yet. That's fine, we'll fix it in the next task.

**Step 4: Commit**

```bash
git add src/lib/data/dashboard.ts src/app/dashboard-content.tsx
git commit -m "Add daily issuance trend data for sparkline"
```

---

## Task 3: Redesign KPI Cards as Dense Inline Strip

**Files:**

- Modify: `src/components/dashboard/kpi-cards.tsx`

This is the biggest visual change. Replace the grid layout with a dense inline strip.

**Step 1: Rewrite `kpi-cards.tsx`**

Key changes:

- Accept `dailyTrend: number[]` prop
- Remove the grid layout (`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`)
- Hero number in `text-3xl font-bold font-mono tabular-nums` with sparkline inline
- Secondary metrics as inline `<span>` elements separated by ` . ` (middle dot)
- Keep `data-testid="kpi-total-certs"` on the hero number for e2e compatibility
- All numbers get `font-mono tabular-nums`
- Expiring count in amber when > 0
- "Updated X ago" right-aligned on the first line, `text-xs text-muted-foreground/50`
- Total height target: ~60px

The component structure:

```tsx
import Link from "next/link";
import { Sparkline } from "@/components/dashboard/sparkline";
import { RelativeTime } from "@/components/ui/relative-time";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ... interface with dailyTrend: number[] added ...

export function KPICards({ /* all existing props + dailyTrend */ }) {
  return (
    <div className="space-y-0.5">
      {/* Line 1: Hero + sparkline + context + updated */}
      <div className="flex items-baseline gap-2 flex-wrap">
        <span data-testid="kpi-total-certs" className="text-3xl font-bold font-mono tabular-nums">
          {activeCerts.toLocaleString()}
        </span>
        <Sparkline data={dailyTrend} className="self-center" />
        <span className="text-sm text-muted-foreground">
          {typeFilter ? `active ${typeFilter}s` : "active"}
        </span>
        <span className="text-sm text-muted-foreground/50">&middot;</span>
        <span className="text-sm text-muted-foreground">
          {((activeCerts / totalCerts) * 100).toFixed(0)}% of {totalCerts.toLocaleString()}
        </span>
        {lastUpdated && (
          <span className="ml-auto text-xs text-muted-foreground/40">
            <RelativeTime date={lastUpdated} />
          </span>
        )}
      </div>

      {/* Line 2: Secondary metrics inline */}
      <div className="flex items-baseline gap-1 flex-wrap text-sm">
        {/* ... tooltipped metrics separated by middot ... */}
      </div>
    </div>
  );
}
```

See the design doc for the full secondary metrics line with tooltips on each metric.

**Step 2: Build and verify**

Run: `cd /Users/swhitt/Code/personal/bimi-quest && bun run build 2>&1 | tail -10`
Expected: Successful build.

**Step 3: Visual check**

Run: `cd /Users/swhitt/Code/personal/bimi-quest && bun run dev`
Check `http://localhost:3000` — KPI strip should be much denser.

**Step 4: Commit**

```bash
git add src/components/dashboard/kpi-cards.tsx
git commit -m "Redesign KPI cards as dense inline strip with sparkline"
```

---

## Task 4: Strip Cards from Chart Components and Reduce Heights

**Files:**

- Modify: `src/components/dashboard/dashboard-charts.tsx`
- Modify: `src/components/dashboard/market-share-chart.tsx`
- Modify: `src/components/dashboard/trend-chart.tsx`
- Modify: `src/components/dashboard/cert-type-chart.tsx`

**Step 1: Update `dashboard-charts.tsx`**

Replace the `grid gap-4 md:grid-cols-2 lg:grid-cols-3` with a flex layout with thin dividers:

```tsx
export function DashboardCharts({ /* same props */ }) {
  return (
    <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border">
      <div className="flex-1 min-w-0 pb-3 md:pb-0 md:pr-3">
        <MarketShareChart data={caBreakdown} selectedCA={selectedCA} apiQuery={apiQuery} />
      </div>
      <div className="flex-1 min-w-0 py-3 md:py-0 md:px-3">
        <TrendChart data={monthlyTrend} selectedCA={selectedCA} apiQuery={apiQuery} hasDateFilter={hasDateFilter} />
      </div>
      <div className="flex-1 min-w-0 pt-3 md:pt-0 md:pl-3">
        <CertTypeChart caBreakdown={caBreakdown} markTypeBreakdown={markTypeBreakdown} apiQuery={apiQuery} />
      </div>
    </div>
  );
}
```

**Step 2: Strip Card wrappers from each chart component**

In `market-share-chart.tsx`, `trend-chart.tsx`, and `cert-type-chart.tsx`:

- Remove `Card`, `CardHeader`, `CardTitle`, `CardAction`, `CardContent` imports and wrapper elements
- Replace with a plain `<div>` wrapper
- Keep the download button as a small icon in the top-right corner with a tiny monospace label
- Reduce chart heights: market share capped at 200px, trend chart `h-[200px]`, cert type `h-[200px]`
- Remove the summary list below market share (redundant)
- Remove cert type chart legend (tooltip suffices)

**Step 3: Build and verify**

Run: `cd /Users/swhitt/Code/personal/bimi-quest && bun run build 2>&1 | tail -10`
Expected: Successful build.

**Step 4: Commit**

```bash
git add src/components/dashboard/dashboard-charts.tsx src/components/dashboard/market-share-chart.tsx src/components/dashboard/trend-chart.tsx src/components/dashboard/cert-type-chart.tsx
git commit -m "Strip card chrome from charts, add dividers, reduce heights"
```

---

## Task 5: Strip Cards from Bottom Row Components

**Files:**

- Modify: `src/components/dashboard/industry-chart.tsx`
- Modify: `src/components/dashboard/expiry-chart.tsx`
- Modify: `src/components/dashboard/top-orgs.tsx`
- Modify: `src/components/dashboard/recent-certs.tsx`

**Step 1: Industry chart -- remove Card, compact**

- Remove Card/CardHeader/CardContent wrappers
- Add tiny monospace label
- Cap at 6 bars displayed
- Reduce bar height
- Remove legend

**Step 2: Expiry chart -- remove Card, compact**

- Remove Card/CardHeader/CardContent wrappers
- Add tiny monospace label
- Reduce height to 200px

**Step 3: Top orgs -- remove Card, numbered list format**

- Remove Card/CardHeader/CardContent wrappers
- Add tiny monospace label
- Show 10 entries (change from 15)
- Use padded numbers: `01. Org Name  142`
- Reduce spacing and text size
- Wrap in `overflow-y-auto max-h-[240px]`

**Step 4: Recent certs -- ticker feed format**

- Remove Card/CardHeader/CardContent/table wrappers
- Add tiny monospace label with "View all" link
- Replace table with a simple list of items (20px logo + org name + badge + relative time)
- Keep pagination controls at the bottom

**Step 5: Build and verify**

Run: `cd /Users/swhitt/Code/personal/bimi-quest && bun run build 2>&1 | tail -10`

**Step 6: Commit**

```bash
git add src/components/dashboard/industry-chart.tsx src/components/dashboard/expiry-chart.tsx src/components/dashboard/top-orgs.tsx src/components/dashboard/recent-certs.tsx
git commit -m "Strip card chrome from bottom row, compact all components"
```

---

## Task 6: Restructure Dashboard Layout

**Files:**

- Modify: `src/app/dashboard-content.tsx`

**Step 1: Flatten the dashboard layout**

Replace the current multi-row grid with a dense vertical flow:

```tsx
return (
  <div data-testid="dashboard" className="space-y-3">
    <KPICards ... dailyTrend={data.dailyTrend} />
    <DashboardCharts ... />
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      <IndustryChart initialData={industryData ?? undefined} />
      <ExpiryChart initialData={expiryData ?? undefined} />
      <TopOrgs initialData={topOrgsData ?? undefined} />
      <RecentCerts ... />
    </div>
  </div>
);
```

Key changes: `space-y-6` becomes `space-y-3`, bottom row becomes one 4-column grid, remove `md:col-span` sizing. Mobile stacks vertically.

**Step 2: Build and verify**

Run: `cd /Users/swhitt/Code/personal/bimi-quest && bun run build 2>&1 | tail -10`

**Step 3: Visual check**

Run dev server, verify the full dashboard fits above the fold at 1080p. All test IDs preserved.

**Step 4: Commit**

```bash
git add src/app/dashboard-content.tsx
git commit -m "Restructure dashboard layout to dense 3-section flow"
```

---

## Task 7: Add Keyboard Shortcuts

**Files:**

- Create: `src/components/keyboard-shortcuts.tsx`
- Modify: `src/app/dashboard-content.tsx` (or `src/app/layout.tsx`)

**Step 1: Create keyboard shortcuts component**

```tsx
// src/components/keyboard-shortcuts.tsx
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SHORTCUTS = [
  { key: "?", description: "Show shortcuts" },
  { key: "/", description: "Focus search" },
  { key: "1", description: "Scroll to metrics" },
  { key: "2", description: "Scroll to charts" },
  { key: "3", description: "Scroll to details" },
];

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      switch (e.key) {
        case "?":
          e.preventDefault();
          setOpen((o) => !o);
          break;
        case "/":
          e.preventDefault();
          document.querySelector<HTMLInputElement>("[data-search-input]")?.focus();
          break;
        case "Escape":
          setOpen(false);
          break;
        case "1":
        case "2":
        case "3": {
          const sections = document.querySelectorAll("[data-dashboard-section]");
          const idx = parseInt(e.key) - 1;
          sections[idx]?.scrollIntoView({ behavior: "smooth", block: "start" });
          break;
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-sm font-mono">Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{s.description}</span>
              <kbd className="px-1.5 py-0.5 rounded border bg-muted text-xs font-mono">{s.key}</kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Add `data-dashboard-section` attributes to dashboard sections**

In `src/app/dashboard-content.tsx`, add `data-dashboard-section` attributes to each section wrapper.

**Step 3: Add `data-search-input` to search input**

In `src/components/universal-search.tsx`, add `data-search-input` to the input element.

**Step 4: Mount `<KeyboardShortcuts />` in `dashboard-content.tsx`**

**Step 5: Build and verify**

Run: `cd /Users/swhitt/Code/personal/bimi-quest && bun run build 2>&1 | tail -10`

**Step 6: Verify keyboard shortcuts work**

Run dev server. Press `?` for dialog, `/` for search focus, `1`-`3` for section scrolling.

**Step 7: Commit**

```bash
git add src/components/keyboard-shortcuts.tsx src/app/dashboard-content.tsx src/components/universal-search.tsx
git commit -m "Add keyboard shortcuts for dashboard navigation"
```

---

## Task 8: E2E Smoke Test Verification

**Files:**

- Read: `e2e/smoke.spec.ts` (no changes expected)

**Step 1: Run e2e tests**

Run: `cd /Users/swhitt/Code/personal/bimi-quest && bunx playwright test e2e/smoke.spec.ts`

Expected: All tests pass. Key assertions to verify:

- `data-testid="main-nav"` -- unchanged (in nav.tsx)
- `data-testid="dashboard"` -- preserved on wrapper div
- `data-testid="kpi-total-certs"` -- preserved on hero number
- KPI text contains a digit

**Step 2: Fix any test failures**

If tests fail, adjust the dashboard components to preserve the expected test IDs and content.

**Step 3: Final build check**

Run: `cd /Users/swhitt/Code/personal/bimi-quest && bun run build`
Expected: Clean build with no errors.

---

## Task 9: Final Visual Polish

**Files:**

- Potentially any dashboard component

**Step 1: Run dev server and review**

Run: `bun run dev` and check:

1. Dashboard fits above the fold on 1080p
2. Sparkline renders correctly with real data
3. Charts have thin dividers, no card borders
4. Bottom row is 4 columns on desktop, stacked on mobile
5. All tooltips work on metric hover
6. Mobile responsive layout works (resize browser)
7. Dark/light theme both look good

**Step 2: Fix any visual issues**

Adjust padding, font sizes, colors, spacing as needed.

**Step 3: Commit any polish fixes**

```bash
git add -A
git commit -m "Polish terminal dashboard visual details"
```
