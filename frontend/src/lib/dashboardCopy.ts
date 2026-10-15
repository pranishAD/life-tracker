// Small derived-copy helpers for the dashboard hero sentence. Pulled out of
// the page component so they're easy to unit test in isolation.
import type { GradeKey } from "./grade";

const NEXT_GRADE: Record<GradeKey, { grade: string; min: number } | null> = {
  d: { grade: "Slipping", min: 40 },
  c: { grade: "On Track", min: 60 },
  b: { grade: "Strong", min: 75 },
  a: { grade: "Locked In", min: 90 },
  s: null,
  cal: null,
};

/** "12 more points to Locked In." — null once already at S (nothing higher). */
export function pointsToNextGrade(score: number, gradeKey: GradeKey): string | null {
  const next = NEXT_GRADE[gradeKey];
  if (!next) return null;
  const points = next.min - score;
  if (points <= 0) return null;
  return `${points} more point${points === 1 ? "" : "s"} to ${next.grade}.`;
}
