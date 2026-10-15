// Pure helpers for turning a backend `Grade` ("S" | "A" | ... | "Calibrating")
// into the pieces the design system needs: a short key for Tailwind classes
// (`grade-s`, `grade-a`, ...) and a human label. Kept framework-free so it's
// easy to unit test and reuse in both components and charts.
import type { CSSProperties } from "react";
import type { Grade } from "../api/types";

export type GradeKey = "s" | "a" | "b" | "c" | "d" | "cal";

const GRADE_LABELS: Record<GradeKey, string> = {
  s: "Locked In",
  a: "Strong",
  b: "On Track",
  c: "Slipping",
  d: "Off Track",
  cal: "Calibrating",
};

// design/tokens.json `grades` thresholds, used when we need to derive a
// grade from a raw score client-side (e.g. computing a goal's factor-bar
// colour, which the design keys off "what grade would this % get").
const THRESHOLDS: { min: number; key: GradeKey }[] = [
  { min: 90, key: "s" },
  { min: 75, key: "a" },
  { min: 60, key: "b" },
  { min: 40, key: "c" },
  { min: 0, key: "d" },
];

/** Map the API's Grade enum to the short key used in Tailwind class names. */
export function gradeToKey(grade: Grade): GradeKey {
  if (grade === "Calibrating") return "cal";
  return grade.toLowerCase() as GradeKey;
}

/** Map a short key back to the uppercase letter the badge displays. */
export function keyToLetter(key: GradeKey): string {
  return key === "cal" ? "…" : key.toUpperCase();
}

export function gradeLabel(key: GradeKey): string {
  return GRADE_LABELS[key];
}

/**
 * Derive a grade key from a 0-100 score, without needing a round trip to the
 * API. Used for things like the score-breakdown bars, where each factor
 * (pace/consistency/...) gets coloured as if its own percentage were a score.
 */
export function scoreToGradeKey(score: number): GradeKey {
  const found = THRESHOLDS.find((t) => score >= t.min);
  return found?.key ?? "d";
}

// Hex/rgba values straight from design/tokens.json `color.grade`. Components
// that render a grade colour (ScoreRing, GradeBadge, ProgressBar, Card) set
// these as inline CSS custom properties (--g / --g-dim) — the same pattern
// the design/screens-html reference uses via `[data-grade]` selectors —
// rather than relying on Tailwind's JIT class names for a value chosen at
// runtime.
const GRADE_COLORS: Record<GradeKey, { g: string; gDim: string }> = {
  s: { g: "#ffc93c", gDim: "rgba(255, 201, 60, 0.16)" },
  a: { g: "#3ddc84", gDim: "rgba(61, 220, 132, 0.16)" },
  b: { g: "#41b6ff", gDim: "rgba(65, 182, 255, 0.16)" },
  c: { g: "#ff9f43", gDim: "rgba(255, 159, 67, 0.16)" },
  d: { g: "#ff4d5e", gDim: "rgba(255, 77, 94, 0.16)" },
  cal: { g: "#8a8aa0", gDim: "#1d1d28" },
};

export function gradeCssVars(key: GradeKey): CSSProperties {
  const { g, gDim } = GRADE_COLORS[key];
  return { "--g": g, "--g-dim": gDim } as CSSProperties;
}
