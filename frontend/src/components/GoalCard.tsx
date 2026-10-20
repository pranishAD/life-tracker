import { Link } from "react-router-dom";
import CategoryChip from "./CategoryChip";
import EmojiTile from "./EmojiTile";
import GradeBadge from "./GradeBadge";
import ProgressBar from "./ProgressBar";
import ScoreRing from "./ScoreRing";
import { useHabitExtras } from "../hooks/useGoalExtras";
import { useGoalScore } from "../hooks/useScoring";
import { gradeToKey, type GradeKey } from "../lib/grade";
import { expectedPerWeek, scheduleLabel } from "../lib/frequency";
import { goalIdentity } from "../lib/identity";
import { formatNum, habitProgress, milestoneProgress, numericProgress } from "../lib/progress";
import { formatShort, isPast } from "../lib/date";
import type { CategoryRef, Goal, IdentityColor } from "../api/types";

/** One goal in the Goals list / dashboard, per design/components.md "GoalCard".
 * This wrapper fetches the score + habit stats; GoalCardView draws it. */
export default function GoalCard({ goal }: { goal: Goal }) {
  const { data: score } = useGoalScore(goal.id);
  const { checkInsThisWeek, streakDays } = useHabitExtras(goal);
  const gradeKey = score ? gradeToKey(score.grade) : "cal";
  const isCal = gradeKey === "cal";

  return (
    <GoalCardView
      href={`/goals/${goal.id}`}
      title={goal.title}
      category={goal.category}
      {...goalIdentity(goal)}
      gradeKey={gradeKey}
      score={score?.total ?? null}
      percent={goalPercent(goal, checkInsThisWeek)}
      typeMeta={goalTypeMeta(goal, checkInsThisWeek)}
      footer={goalFooterStat(goal, { isCal, checkInsThisWeek, streakDays, pace: score?.pace })}
    />
  );
}

export function goalPercent(goal: Goal, checkInsThisWeek: number): number {
  if (goal.type === "numeric") return numericProgress(goal).percent;
  if (goal.type === "milestone") return milestoneProgress(goal).percent;
  return habitProgress(goal, checkInsThisWeek).percent;
}

/** "Numeric · 72 / 80 kg", "Habit · 4 / 5 this week", "Milestone · 3 / 8 · due Dec 1". */
export function goalTypeMeta(goal: Goal, checkInsThisWeek: number): string {
  if (goal.type === "numeric") {
    const start = goal.start_value ?? 0;
    const target = goal.target_value ?? 0;
    // Before the first check-in show the plan ("32 → 28 min"), after it the
    // current value against the target.
    if (goal.check_in_count === 0) return `Numeric · ${formatNum(start)} → ${formatNum(target)} ${goal.unit ?? ""}`.trim();
    return `Numeric · ${numericProgress(goal).metaRight}`;
  }
  if (goal.type === "milestone") {
    const p = milestoneProgress(goal);
    const due = goal.deadline ? ` · due ${formatShort(goal.deadline)}` : "";
    return `Milestone · ${p.done} / ${p.total}${due}`;
  }
  if (goal.check_in_count === 0) return `Habit · ${scheduleLabel(goal)}`;
  return `Habit · ${checkInsThisWeek} / ${expectedPerWeek(goal)} this week`;
}

export function goalFooterStat(
  goal: Goal,
  ctx: { isCal: boolean; checkInsThisWeek: number; streakDays: number; pace?: number },
): { text: string; warn: boolean } {
  if (ctx.isCal) {
    if (goal.type === "milestone") {
      const p = milestoneProgress(goal);
      return { text: `${p.done} / ${p.total}`, warn: false };
    }
    if (goal.type === "habit") return { text: `${ctx.checkInsThisWeek} / ${expectedPerWeek(goal)}`, warn: false };
    return { text: "New goal", warn: false };
  }
  if (goal.type === "habit") {
    return ctx.streakDays > 0 ? { text: `${ctx.streakDays}-day streak`, warn: false } : { text: "No streak yet", warn: false };
  }
  if (goal.type === "milestone") {
    const overdue = goal.milestones.filter((m) => !m.is_done && m.due_date && isPast(m.due_date)).length;
    if (overdue > 0) return { text: `${overdue} overdue`, warn: true };
  }
  const behind = ctx.pace !== undefined ? ctx.pace < 0.9 : false;
  return { text: behind ? "Behind pace" : "On pace", warn: behind };
}

interface GoalCardViewProps {
  title: string;
  emoji: string;
  color: IdentityColor;
  category: Pick<CategoryRef, "name" | "emoji">;
  gradeKey: GradeKey;
  score: number | null;
  percent: number;
  typeMeta: string;
  footer: { text: string; warn: boolean };
  /** Omit for the form preview (not clickable). */
  href?: string;
}

/** Pure presentational card: no data fetching, so the goal form can render
 * a live preview of a goal that doesn't exist yet. The ring, bar and grade
 * label use the *grade* colour; only the tile uses the identity colour. */
export function GoalCardView({ title, emoji, color, category, gradeKey, score, percent, typeMeta, footer, href }: GoalCardViewProps) {
  const body = (
    <>
      <div className="flex justify-between items-start gap-3">
        <div className="flex gap-3 items-start min-w-0">
          <EmojiTile emoji={emoji} color={color} />
          <div className="min-w-0">
            <h3 className="text-heading-md mb-1 break-words">{title || "Goal name"}</h3>
            <div className="flex items-center gap-1.5 flex-wrap text-body-sm text-ink-muted">
              <CategoryChip category={category} size="sm" />
              <span>{typeMeta}</span>
            </div>
          </div>
        </div>
        <ScoreRing score={score} grade={gradeKey} size={64} strokeWidth={6} scoreFontSize={20} />
      </div>
      <div className="mt-4">
        <ProgressBar percent={percent} grade={gradeKey} thin />
      </div>
      <div className="flex justify-between items-center mt-3 text-body-sm">
        <GradeBadge grade={gradeKey} size="sm" showLabel />
        <span className={footer.warn ? "text-grade-d" : "text-ink-muted"}>{footer.text}</span>
      </div>
    </>
  );
  const cls = "bg-surface-1 border border-border rounded-lg p-4 md:p-5 block";
  if (!href) return <div className={cls}>{body}</div>;
  return (
    <Link
      to={href}
      className={cls + " hover:bg-surface-2 hover:border-border-strong transition focus-visible:shadow-focus focus-visible:outline-none"}
    >
      {body}
    </Link>
  );
}
