// Pure progress-bar math for a goal. Each goal type (numeric/habit/milestone)
// defines "progress" differently per docs/master-plan.md section 2 — these
// helpers compute the 0-100 percent and the meta text the design shows above
// the bar, without touching the DOM or React.
import type { Goal } from "../api/types";
import { addDays, daysBetween, todayIso } from "./date";

export interface ProgressInfo {
  percent: number;
  metaLeft: string;
  metaRight: string;
}

export function numericProgress(goal: Goal): ProgressInfo {
  const current = goal.current_value ?? 0;
  const target = goal.target_value ?? 0;
  const percent = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const unit = goal.unit ?? "";
  return {
    percent,
    metaLeft: goal.title,
    metaRight: `${formatNum(current)} / ${formatNum(target)} ${unit}`.trim(),
  };
}

export function milestoneProgress(goal: Goal): ProgressInfo & { done: number; total: number } {
  const total = goal.milestones.length;
  const done = goal.milestones.filter((m) => m.is_done).length;
  const percent = total > 0 ? (done / total) * 100 : 0;
  return { percent, done, total, metaLeft: `${done} of ${total} subtasks done`, metaRight: "" };
}

/** Habit progress needs this week's check-in count, which the caller fetches
 * separately (the Goal object alone doesn't carry it) — see useGoalExtras. */
export function habitProgress(goal: Goal, checkInsThisWeek: number): ProgressInfo {
  const target = goal.frequency_per_week ?? 0;
  const percent = target > 0 ? Math.min(100, (checkInsThisWeek / target) * 100) : 0;
  return {
    percent,
    metaLeft: `${checkInsThisWeek} of ${target} this week`,
    metaRight: "Week resets Monday",
  };
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * The "pace tick" mark: where the goal *should* be today if progress were
 * linear from start_date to deadline (matches the scoring engine's pace
 * definition in master-plan.md section 4). Returns null when there's no
 * deadline — components.md says to hide the tick in that case.
 */
export function expectedProgressPercent(goal: Goal): number | null {
  if (!goal.deadline) return null;
  const total = daysBetween(goal.start_date, goal.deadline);
  if (total <= 0) return 100;
  const elapsed = daysBetween(goal.start_date, todayIso());
  return Math.max(0, Math.min(100, (elapsed / total) * 100));
}

export function daysLeft(deadline: string): number {
  return daysBetween(todayIso(), deadline);
}

export function deadlinePlusDays(start: string, days: number): string {
  return addDays(start, days);
}
