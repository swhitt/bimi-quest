import type { BimiGrade } from "@/lib/bimi/types";
import { GRADE_COLORS } from "@/lib/colors";

const GRADE_STYLES: Record<BimiGrade, string> = GRADE_COLORS;

export function ValidationGrade({ grade, summary }: { grade: BimiGrade; summary: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-lg text-2xl font-bold ${GRADE_STYLES[grade]}`}
        role="img"
        aria-label={`Validation grade: ${grade}`}
      >
        {grade}
      </div>
      <span className="text-sm text-muted-foreground">{summary}</span>
    </div>
  );
}
