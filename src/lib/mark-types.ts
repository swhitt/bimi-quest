/** Short labels, icons, and colors for BIMI mark types */

export interface MarkTypeInfo {
  /** Single-word pill label */
  label: string;
  /** Full official name */
  title: string;
  /** SVG path(s) for a 24x24 viewBox icon */
  iconPaths: string[];
  /** Tailwind text color class */
  colorClass: string;
  /** Tailwind classes for styled badge */
  badgeClass: string;
}

const MARK_TYPES: Record<string, MarkTypeInfo> = {
  "Registered Mark": {
    label: "Registered",
    title: "Registered Trademark",
    iconPaths: ["M9 12l2 2 4-4", "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"],
    colorClass: "text-emerald-600 dark:text-emerald-400",
    badgeClass: "border-emerald-500/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  "Government Mark": {
    label: "Government",
    title: "Government Mark",
    iconPaths: ["M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"],
    colorClass: "text-blue-600 dark:text-blue-400",
    badgeClass: "border-blue-500/50 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  "Prior Use Mark": {
    label: "Prior Use",
    title: "Prior Use (Common Law) Mark",
    iconPaths: ["M12 8v4l3 3", "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"],
    colorClass: "text-amber-600 dark:text-amber-400",
    badgeClass: "border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  "Modified Registered Mark": {
    label: "Modified",
    title: "Modified Registered Mark",
    iconPaths: ["M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"],
    colorClass: "text-violet-600 dark:text-violet-400",
    badgeClass: "border-violet-500/50 bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  },
  "Pending Registration Mark": {
    label: "Pending",
    title: "Pending Registration Mark",
    iconPaths: ["M5 12h14", "M12 5v14"],
    colorClass: "text-orange-600 dark:text-orange-400",
    badgeClass: "border-orange-500/50 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  },
};

export function getMarkTypeInfo(markType: string | null): MarkTypeInfo | null {
  if (!markType) return null;
  return MARK_TYPES[markType] ?? null;
}

/** All mark types for filter dropdowns */
export const ALL_MARK_TYPES = Object.entries(MARK_TYPES).map(([value, info]) => ({
  value,
  label: info.label,
  title: info.title,
}));
