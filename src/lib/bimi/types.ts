export interface BimiCheckItem {
  id: string;
  category: "spec" | "compatibility";
  label: string;
  status: "pass" | "warn" | "fail" | "skip" | "info";
  summary: string;
  detail?: string;
  specRef?: string;
}

export type BimiGrade = "A" | "B" | "C" | "D" | "F";

export interface BimiGradeResult {
  grade: BimiGrade;
  summary: string;
}
