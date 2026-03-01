import type { BimiGrade } from "@/lib/bimi/types";

const GRADE_STYLES: Record<BimiGrade, string> = {
  A: "bg-emerald-600 text-white dark:bg-emerald-500",
  B: "bg-emerald-600/80 text-white dark:bg-emerald-500/80",
  C: "bg-amber-500 text-white dark:bg-amber-400 dark:text-black",
  D: "bg-orange-500 text-white dark:bg-orange-400 dark:text-black",
  F: "bg-destructive text-destructive-foreground",
};

export function ValidationGrade({ grade, summary }: { grade: BimiGrade; summary: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-lg text-2xl font-bold ${GRADE_STYLES[grade]}`}
      >
        {grade}
      </div>
      <span className="text-sm text-muted-foreground">{summary}</span>
    </div>
  );
}
