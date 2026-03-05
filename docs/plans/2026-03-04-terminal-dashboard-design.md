# Terminal Dashboard Redesign

Dense command center aesthetic. Maximum information density. Every pixel earns its place.

## Principles

- No card wrappers (`<Card>`) on the dashboard. Sections separated by whitespace alone.
- All numbers in `font-mono tabular-nums`.
- No section headers/labels — visualizations are self-evident. Labels appear on hover as tooltips.
- Everything above the fold on 1080p.
- Keyboard-navigable.

## Layout (top to bottom)

### KPI Strip

Single dense strip, not a grid. Hero number + inline sparkline + secondary metrics flowing inline.

```
1,247 active  [sparkline]  84% of 1,483 . DigiCert 1,198 +42 . 80.7% share
                            312 orgs . 3 expiring . 94% VMC (1174/73)
                                                          updated 2m ago
```

- Hero "active" count stays text-3xl (slightly smaller than current text-4xl to save vertical space)
- 30-day sparkline: hand-rolled SVG, ~20 data points, inline next to hero number, ~60x16px
- Secondary metrics flow as inline text separated by middle dots, not in separate grid cells
- "Expiring" count gets amber color when > 0 — only color accent in the strip
- "updated 2m ago" right-aligned, text-xs, very muted
- Hover any metric for tooltip with full context
- Total vertical height target: ~64px (down from ~120px)

### Charts Strip

Three charts side by side. No card wrappers. Thin vertical dividers (1px border-r).

```
[Market Share donut] | [Issuance Trend area] | [Cert Mix stacked bar]
```

- Shared fixed height: 200px (down from ~320px)
- Tiny monospace label in each chart's top-left corner (like axis labels, text-[10px] text-muted-foreground/50)
- Market share donut: center label shows dominant CA percentage
- Trend chart: compact area fill, no dots on data points
- Clicking a chart segment navigates directly (no "View details" link)
- Charts container: `flex` with `gap-0`, children get `flex-1` and `border-r last:border-r-0`

### Bottom Row — 4-Column Fused Layout

One row replaces the current two rows. No cards, no headers.

```
[Industry bars] [Expiry area] [Top Orgs list] [Recent feed]
```

- 4 equal columns via `grid grid-cols-4 gap-3`
- Shared height: 240px, each column scrollable if content overflows
- **Industry:** Horizontal bar chart, 6 bars max, compact. text-[11px] labels.
- **Expiry:** Small area chart, next 12 months of expiry density
- **Top Orgs:** Numbered list, 10 entries. `01. Org Name  142` format, monospace numbers right-aligned
- **Recent feed:** Vertical ticker — 24px logo thumbnail + org name + relative time. No table, no headers. 8 entries visible. Logo is a tiny circle/square.

Mobile: stack vertically, each section full-width. Charts become swipeable horizontal scroll.

### Keyboard Shortcuts

- `?` — shortcut overlay (small dialog listing all shortcuts)
- `1` `2` `3` — scroll to KPI / charts / bottom sections
- `/` — focus search bar (already exists via UniversalSearch)
- `j` / `k` — navigate recent feed items
- `Enter` — open focused item's detail page
- `Esc` — clear focus / close overlay

Implementation: single `useEffect` with `keydown` listener on `document`, gated to not fire when an input/select is focused.

## Components to Modify

1. `src/components/dashboard/kpi-cards.tsx` — flatten to inline strip, add sparkline
2. `src/components/dashboard/dashboard-charts.tsx` — remove Card wrappers, add dividers, reduce height
3. `src/components/dashboard/trend-chart.tsx` — reduce height, remove dots
4. `src/components/dashboard/market-share-chart.tsx` — add center label, reduce height
5. `src/components/dashboard/cert-type-chart.tsx` — reduce height
6. `src/components/dashboard/industry-chart.tsx` — compact bars, remove Card
7. `src/components/dashboard/expiry-chart.tsx` — compact, remove Card
8. `src/components/dashboard/top-orgs.tsx` — numbered list format, remove Card
9. `src/components/dashboard/recent-certs.tsx` — ticker feed format, remove table/Card
10. `src/app/dashboard-content.tsx` — new layout grid, remove spacing
11. New: `src/components/dashboard/sparkline.tsx` — tiny SVG sparkline component
12. New: `src/components/keyboard-shortcuts.tsx` — shortcut listener + overlay

## New Component: Sparkline

Hand-rolled SVG, no library dependency. Props: `data: number[]`, `width`, `height`, `color`.
Renders a polyline with optional area fill. ~30 lines of code.

## Data Requirements

- Need a new API endpoint or data function that returns the last 30 days of daily active cert counts (for the sparkline)
- Everything else uses existing data — just presented differently

## Risks

- Recharts may fight against reduced heights (legends, margins). May need to suppress default padding.
- Mobile responsive needs careful thought — the 4-column bottom row must stack gracefully.
- Removing Card wrappers changes the visual rhythm; needs careful spacing to not feel chaotic.
