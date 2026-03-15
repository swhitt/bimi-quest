/** Centralized color constants for consistent theming across components. */

/** Status icon/text colors for check results. */
export const STATUS_COLORS = {
  pass: "text-emerald-600 dark:text-emerald-400",
  fail: "text-destructive",
  warn: "text-amber-500 dark:text-amber-400",
  info: "text-blue-500 dark:text-blue-400",
  skip: "text-muted-foreground",
  not_applicable: "text-muted-foreground",
} as const;

/** Severity badge colors for lint results (background + text + border). */
export const SEVERITY_BADGE_COLORS = {
  error: "bg-destructive/10 text-destructive border-destructive/30",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  notice: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
} as const;

/** Summary count badge colors (border + text). */
export const SUMMARY_BADGE_COLORS = {
  errors: "border-destructive/50 text-destructive",
  warnings: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  notices: "border-blue-500/50 text-blue-600 dark:text-blue-400",
  passed: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
} as const;

/** Certificate validity colors for expiry dates. */
export const EXPIRY_COLORS = {
  active: "text-green-700 dark:text-emerald-400/80",
  "expiring-soon": "text-amber-700 dark:text-amber-400/70",
  expired: "text-muted-foreground/70 line-through decoration-muted-foreground/30",
} as const;

/** CT log staleness indicator colors. */
export const STALENESS_COLORS = {
  fresh: "text-muted-foreground",
  stale: "text-amber-700 dark:text-amber-400/70",
  critical: "text-foreground",
} as const;

/** Validation grade background colors. */
export const GRADE_COLORS = {
  A: "bg-emerald-600 text-white dark:bg-emerald-500",
  B: "bg-emerald-600/80 text-white dark:bg-emerald-500/80",
  C: "bg-amber-500 text-white dark:bg-amber-400 dark:text-black",
  D: "bg-orange-500 text-white dark:bg-orange-400 dark:text-black",
  F: "bg-destructive text-destructive-foreground",
} as const;
