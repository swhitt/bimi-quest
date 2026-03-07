/**
 * Central timer registry for BIMI Quest.
 *
 * Catalogues every periodic timer in the system (server-side crons, worker
 * polling loops, and client-side intervals) so external apps can query a
 * single endpoint to understand what's running and when.
 */

export type TimerKind = "cron" | "worker" | "client";

export interface TimerDescriptor {
  /** Unique slug, e.g. "cron-ingest" */
  id: string;
  /** Human-readable label */
  name: string;
  /** Where this timer runs */
  kind: TimerKind;
  /** Interval in milliseconds (null for cron-expression timers) */
  intervalMs: number | null;
  /** Cron expression if applicable */
  cron: string | null;
  /** Human-readable description of the interval */
  intervalHuman: string;
  /** What the timer does */
  description: string;
  /** API path or source file for reference */
  source: string;
}

/** All known timers in the BIMI Quest ecosystem. */
export const TIMERS: TimerDescriptor[] = [
  // ── Server-side crons (Vercel) ──────────────────────────────────
  {
    id: "cron-ingest",
    name: "CT Log Ingestion",
    kind: "cron",
    intervalMs: 5 * 60_000,
    cron: "*/5 * * * *",
    intervalHuman: "Every 5 minutes",
    description:
      "Fetches new entries from the Gorgon CT log and ingests BIMI certificates into the database.",
    source: "/api/cron/ingest",
  },
  {
    id: "cron-og-gallery",
    name: "OG Gallery Rebuild",
    kind: "cron",
    intervalMs: 24 * 60 * 60_000,
    cron: "0 6 * * *",
    intervalHuman: "Daily at 06:00 UTC",
    description:
      "Regenerates the OpenGraph gallery image used for social-media embeds.",
    source: "/api/cron/og-gallery",
  },

  // ── Worker timers ───────────────────────────────────────────────
  {
    id: "worker-stream",
    name: "Stream Poller",
    kind: "worker",
    intervalMs: 30_000,
    cron: null,
    intervalHuman: "Every 30 seconds",
    description:
      "Long-running worker that polls the Gorgon CT log for new entries and processes them in real time.",
    source: "src/workers/modes/stream.ts",
  },

  // ── Client-side intervals ──────────────────────────────────────
  {
    id: "client-sth-poll",
    name: "Signed Tree Head Poll",
    kind: "client",
    intervalMs: 15_000,
    cron: null,
    intervalHuman: "Every 15 seconds",
    description:
      "Polls the CT log's Signed Tree Head so the explorer page auto-advances when new entries appear.",
    source: "src/app/ct/[log]/ct-log-content.tsx",
  },
  {
    id: "client-version-check",
    name: "Version Check",
    kind: "client",
    intervalMs: 30_000,
    cron: null,
    intervalHuman: "Every 30 seconds",
    description:
      "Checks for new deployments by comparing the build SHA with the server, prompting users to refresh.",
    source: "src/lib/use-version-check.ts",
  },
  {
    id: "client-sth-tick",
    name: "STH Panel Tick",
    kind: "client",
    intervalMs: 10_000,
    cron: null,
    intervalHuman: "Every 10 seconds",
    description:
      "Forces re-render of relative timestamps in the STH panel so they stay accurate.",
    source: "src/components/ct-log/sth-panel.tsx",
  },
];

/** Look up a single timer by id. */
export function getTimer(id: string): TimerDescriptor | undefined {
  return TIMERS.find((t) => t.id === id);
}

/** Return timers filtered by kind. */
export function getTimersByKind(kind: TimerKind): TimerDescriptor[] {
  return TIMERS.filter((t) => t.kind === kind);
}
