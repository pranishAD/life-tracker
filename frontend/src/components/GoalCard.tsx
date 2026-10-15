import { Link } from "react-router-dom";
import GradeBadge from "./GradeBadge";
import ProgressBar from "./ProgressBar";
import ScoreRing from "./ScoreRing";
import { useHabitExtras } from "../hooks/useGoalExtras";
import { useGoalScore } from "../hooks/useScoring";
import { CATEGORY_ICONS, CATEGORY_LABELS } from "../lib/category";
import { gradeToKey } from "../lib/grade";
import { habitProgress, milestoneProgress, numericProgress } from "../lib/progress";
import { formatShort } from "../lib/date";
import type { Goal } from "../api/types";

/** One goal in the Goals list / dashboard, per design/components.md "GoalCard".
 * The whole card links to the goal's detail page. */
export default function GoalCard({ goal }: { goal: Goal }) {
  const { data: score } = useGoalScore(goal.id);
  const { checkInsThisWeek, streakDays } = useHabitExtras(goal);
  const Icon = CATEGORY_ICONS[goal.category];
  const gradeKey = score ? gradeToKey(score.grade) : "cal";
  const isCal = gradeKey === "cal";

  const { percent, typeMeta } = (() => {
    if (goal.type === "numeric") {
      const p = numericProgress(goal);
      return { percent: p.percent, typeMeta: `Numeric · ${p.metaRight}` };
    }
    if (goal.type === "milestone") {
      const p = milestoneProgress(goal);
      const due = goal.deadline ? ` · due ${formatShort(goal.deadline)}` : "";
      return { percent: p.percent, typeMeta: `Milestone · ${p.done} / ${p.total}${due}` };
    }
    if (isCal) {
      const daysSince = Math.max(0, Math.round((Date.now() - new Date(goal.start_date).getTime()) / 86400000));
      return {
        percent: habitProgress(goal, checkInsThisWeek).percent,
        typeMeta: `Habit · started ${daysSince <= 1 ? "today" : `${daysSince} days ago`}`,
      };
    }
    const p = habitProgress(goal, checkInsThisWeek);
    return { percent: p.percent, typeMeta: `Habit · ${checkInsThisWeek} / ${goal.frequency_per_week} this week` };
  })();

  const footerStat = (() => {
    if (isCal) {
      if (goal.type === "milestone") {
        const p = milestoneProgress(goal);
        return { text: `${p.done} / ${p.total}`, warn: false };
      }
      if (goal.type === "habit") return { text: `${checkInsThisWeek} / ${goal.frequency_per_week}`, warn: false };
      return { text: "New goal", warn: false };
    }
    if (goal.type === "habit") {
      return streakDays > 0
        ? { text: `${streakDays}-day streak`, warn: false }
        : { text: "No streak yet", warn: false };
    }
    if (goal.type === "milestone") {
      const overdue = goal.milestones.filter((m) => !m.is_done && m.due_date && m.due_date < goal.start_date).length;
      if (overdue > 0) return { text: `${overdue} overdue`, warn: true };
    }
    const behind = score ? score.pace < 0.9 : false;
    return { text: behind ? "Behind pace" : "On pace", warn: behind };
  })();

  return (
    <Link
      to={`/goals/${goal.id}`}
      className="bg-surface-1 border border-border rounded-lg p-4 md:p-5 block hover:bg-surface-2 hover:border-border-strong transition"
    >
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <span className="text-label uppercase text-ink-muted bg-surface-2 rounded-sm px-2 py-1 inline-flex items-center gap-1">
            <Icon className="w-4 h-4" strokeWidth={2} />
            {CATEGORY_LABELS[goal.category]}
          </span>
          <h3 className="text-heading-md mt-2 truncate">{goal.title}</h3>
          <p className="text-body-sm text-ink-muted truncate">{typeMeta}</p>
        </div>
        <ScoreRing score={score?.total ?? null} grade={gradeKey} size={64} strokeWidth={6} scoreFontSize={20} />
      </div>
      <div className="mt-4">
        <ProgressBar percent={percent} grade={gradeKey} thin />
      </div>
      <div className="flex justify-between items-center mt-3 text-body-sm">
        <GradeBadge grade={gradeKey} size="sm" showLabel />
        <span className={footerStat.warn ? "text-grade-d" : "text-ink-muted"}>{footerStat.text}</span>
      </div>
    </Link>
  );
}
