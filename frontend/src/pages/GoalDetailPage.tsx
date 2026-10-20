import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, ChevronLeft, Hourglass, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Button from "../components/Button";
import Card from "../components/Card";
import ChartCard from "../components/ChartCard";
import ErrorState from "../components/ErrorState";
import GoalFormModal from "../components/GoalFormModal";
import GradeBadge from "../components/GradeBadge";
import ProgressBar from "../components/ProgressBar";
import ScoreRing from "../components/ScoreRing";
import Skeleton from "../components/Skeleton";
import { useCheckInModal } from "../context/CheckInModalContext";
import { useToast } from "../context/ToastContext";
import { useCheckIns, useDeleteCheckIn } from "../hooks/useCheckIns";
import { useAddMilestone, useDeleteGoal, useGoal, useUpdateMilestone } from "../hooks/useGoals";
import { useGoalScore, useGoalScoreHistory } from "../hooks/useScoring";
import { useHabitExtras } from "../hooks/useGoalExtras";
import { CATEGORY_ICONS, CATEGORY_LABELS } from "../lib/category";
import { formatShort, isPast } from "../lib/date";
import { TEXT_LIMITS } from "../lib/limits";
import { gradeToKey, scoreToGradeKey, type GradeKey } from "../lib/grade";
import {
  expectedProgressPercent,
  habitProgress,
  milestoneProgress,
  numericProgress,
} from "../lib/progress";

export default function GoalDetailPage() {
  const { goalId } = useParams<{ goalId: string }>();
  const navigate = useNavigate();
  const { openCheckIn } = useCheckInModal();
  const { data: goal, isLoading, isError, refetch } = useGoal(goalId);
  const { data: score } = useGoalScore(goalId);
  const { checkInsThisWeek } = useHabitExtras(goal ?? ({} as never));
  const [historyDays, setHistoryDays] = useState<7 | 30>(30);
  const { data: history, isLoading: historyLoading, isError: historyError, refetch: refetchHistory } =
    useGoalScoreHistory(goalId, historyDays);
  const [showEdit, setShowEdit] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const deleteGoal = useDeleteGoal();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-[220px]" />
        <Skeleton className="h-[200px]" />
      </div>
    );
  }
  if (isError || !goal) {
    return (
      <Card>
        <ErrorState message="Couldn't load this goal." onRetry={() => refetch()} />
      </Card>
    );
  }

  const gradeKey: GradeKey = score ? gradeToKey(score.grade) : "cal";
  const isCal = gradeKey === "cal";

  const progress =
    goal.type === "numeric"
      ? numericProgress(goal)
      : goal.type === "milestone"
        ? milestoneProgress(goal)
        : habitProgress(goal, checkInsThisWeek);
  const paceTick = expectedProgressPercent(goal);

  async function handleDelete() {
    if (!goal) return;
    const warn = goal.status === "active" ? "This also removes its check-in history. " : "";
    if (!window.confirm(`${warn}Delete "${goal.title}"? This can't be undone.`)) return;
    await deleteGoal.mutateAsync(goal.id);
    navigate("/goals");
  }

  const Icon = CATEGORY_ICONS[goal.category];

  return (
    <div>
      <div className="md:hidden flex justify-between items-center mb-4">
        <Link to="/goals" className="inline-flex items-center gap-1.5 text-body-sm text-ink-muted">
          <ChevronLeft className="w-4 h-4" /> Goals
        </Link>
        <div className="relative">
          <Button size="sm" variant="ghost" onClick={() => setMenuOpen((v) => !v)}>
            <MoreHorizontal className="w-4 h-4" />
          </Button>
          {menuOpen && <GoalMenu onEdit={() => { setShowEdit(true); setMenuOpen(false); }} onDelete={handleDelete} />}
        </div>
      </div>
      <Link to="/goals" className="hidden md:inline-flex items-center gap-1.5 text-body-sm text-ink-muted mb-4">
        <ChevronLeft className="w-4 h-4" /> All goals
      </Link>

      <Card grade={gradeKey} className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center gap-5 md:gap-8 text-center md:text-left items-center">
          <ScoreRing score={score?.total ?? null} grade={gradeKey} size={140} strokeWidth={12} showCaption scoreFontSize={40} />
          <div className="min-w-0 flex-1">
            <div className="flex gap-2 flex-wrap items-center justify-center md:justify-start mb-2">
              <span className="text-label uppercase text-ink-muted bg-surface-2 rounded-sm px-2 py-1 inline-flex items-center gap-1">
                <Icon className="w-4 h-4" /> {CATEGORY_LABELS[goal.category]}
              </span>
              <span className="text-label uppercase text-ink-muted bg-surface-2 rounded-sm px-2 py-1">
                {goal.type === "habit" ? `Habit · ${goal.frequency_per_week}x / week` : goal.type[0].toUpperCase() + goal.type.slice(1)}
              </span>
              <span className="text-body-sm text-ink-muted">
                {goal.deadline
                  ? `Due ${formatShort(goal.deadline)} · ${Math.max(0, daysUntil(goal.deadline))} days left`
                  : `Started ${formatShort(goal.start_date)} · no deadline`}
              </span>
            </div>
            <h1 className="text-display-mobile md:text-display mb-4">{goal.title}</h1>
            <ProgressBar
              percent={progress.percent}
              grade={gradeKey}
              paceTick={paceTick ?? undefined}
              metaLeft={progress.metaLeft}
              metaRight={progress.metaRight}
            />
            <div className="flex gap-2 flex-wrap items-center justify-center md:justify-start mt-5">
              <Button icon={<Plus className="w-5 h-5" />} onClick={() => openCheckIn(goal.id)}>
                Log check-in
              </Button>
              <Button variant="secondary" className="hidden md:inline-flex" icon={<Pencil className="w-4 h-4" />} onClick={() => setShowEdit(true)}>
                Edit goal
              </Button>
              <Button variant="ghost" className="hidden md:inline-flex" icon={<Trash2 className="w-4 h-4" />} onClick={handleDelete}>
                Delete
              </Button>
              <GradeBadge grade={gradeKey} showLabel />
            </div>
          </div>
        </div>
      </Card>

      {isCal && (
        <div className="flex gap-3 items-start bg-surface-2 border border-dashed border-border-strong rounded-lg p-4 md:p-5 mt-6 md:mt-8">
          <Hourglass className="w-5 h-5 text-ink-muted mt-0.5 flex-none" />
          <div>
            <p className="font-semibold text-body">Calibrating: grade unlocks {calibratesOn(goal.created_at)}</p>
            <p className="text-body-sm text-ink-muted">
              Bihan needs 3 days of data before it grades a goal. Keep logging; your check-ins already count.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:gap-5 md:grid-cols-2 mt-6 md:mt-8">
        <ScoreBreakdownCard score={score} isCal={isCal} />
        {isCal ? (
          <Card>
            <h2 className="text-heading-md mb-4">Score history</h2>
            <div className="h-[96px] rounded-md border border-dashed border-border-strong grid place-items-center text-ink-muted text-body-sm">
              Score history starts {calibratesOn(goal.created_at)}.
            </div>
          </Card>
        ) : (
          <ChartCard
            title="Score history"
            grade={gradeKey}
            data={(history ?? []).map((h) => ({ date: h.snapshot_date, score: h.total }))}
            currentValue={score?.total ?? null}
            deltaValue={history && history.length > 1 && score?.total != null ? score.total - (history[0].total ?? score.total) : null}
            deltaCaption={`vs ${historyDays}d ago`}
            rangeOptions={[7, 30]}
            range={historyDays}
            onRangeChange={(r) => setHistoryDays(r as 7 | 30)}
            isLoading={historyLoading}
            isError={historyError}
            onRetry={() => refetchHistory()}
          />
        )}
      </div>

      <div className="grid gap-4 md:gap-5 md:grid-cols-2 mt-6 md:mt-8">
        {goal.type === "milestone" && <MilestonesCard goal={goal} />}
        <CheckInsCard goalId={goal.id} goal={goal} />
      </div>

      {showEdit && <GoalFormModal goal={goal} onClose={() => setShowEdit(false)} />}
    </div>
  );
}

function GoalMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="absolute right-0 top-10 bg-surface-3 rounded-md shadow-modal py-1 w-36 z-10">
      <button className="w-full text-left px-3 py-2 text-body-sm hover:bg-surface-2 flex items-center gap-2" onClick={onEdit}>
        <Pencil className="w-4 h-4" /> Edit goal
      </button>
      <button className="w-full text-left px-3 py-2 text-body-sm hover:bg-surface-2 flex items-center gap-2 text-grade-d" onClick={onDelete}>
        <Trash2 className="w-4 h-4" /> Delete
      </button>
    </div>
  );
}

function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
}

function calibratesOn(createdAt: string): string {
  const d = new Date(createdAt);
  d.setDate(d.getDate() + 3);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const FACTORS = [
  { key: "pace", label: "Pace", weight: "40% of score" },
  { key: "consistency", label: "Consistency", weight: "30% of score" },
  { key: "momentum", label: "Momentum", weight: "20% of score" },
  { key: "effort", label: "Effort", weight: "10% of score" },
] as const;

function factorHint(key: (typeof FACTORS)[number]["key"], value: number): string {
  const pct = Math.round(value * 100);
  if (key === "pace") return `${pct}% of expected progress reached.`;
  if (key === "consistency") return `${pct}% of expected check-ins logged in the last 14 days.`;
  if (key === "momentum") {
    if (value > 0.55) return "More progress this week than last week.";
    if (value < 0.45) return "Less progress this week than last week.";
    return "About the same pace as last week.";
  }
  return `Average effort ${(value * 5).toFixed(1)} / 5.`;
}

function ScoreBreakdownCard({ score, isCal }: { score: ReturnType<typeof useGoalScore>["data"]; isCal: boolean }) {
  return (
    <Card>
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-heading-md">Score breakdown</h2>
        <span className={isCal ? "text-label text-grade-cal" : "text-body-sm text-ink-muted"}>
          {isCal ? "Calibrating" : "Updated today"}
        </span>
      </div>
      {FACTORS.map((f) => {
        const value = score ? score[f.key] : null;
        const barGrade = value !== null ? scoreToGradeKey(Math.round(value * 100)) : "cal";
        return (
          <div key={f.key} className="py-3 border-t border-border first:border-t-0">
            <div className="grid grid-cols-[96px_1fr_48px] md:grid-cols-[128px_1fr_56px] gap-3 md:gap-4 items-center">
              <div>
                <div className="font-semibold text-body">{f.label}</div>
                <div className="text-ink-muted text-[12px]">{f.weight}</div>
              </div>
              <ProgressBar percent={value !== null ? value * 100 : 0} grade={barGrade} thin />
              <div className="text-right font-semibold text-body tabular-nums">
                {value !== null ? `${Math.round(value * 100)}%` : <span className="text-ink-muted">–</span>}
              </div>
            </div>
            {value !== null && <p className="text-body-sm text-ink-muted mt-1.5">{factorHint(f.key, value)}</p>}
          </div>
        );
      })}
    </Card>
  );
}

function MilestonesCard({ goal }: { goal: NonNullable<ReturnType<typeof useGoal>["data"]> }) {
  const updateMilestone = useUpdateMilestone(goal.id);
  const addMilestone = useAddMilestone(goal.id);
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const done = goal.milestones.filter((m) => m.is_done).length;

  async function handleAdd() {
    if (!title.trim()) return;
    try {
      await addMilestone.mutateAsync({ title });
      setTitle("");
      setAdding(false);
    } catch (err) {
      // e.g. a backend 422 — show its message instead of failing silently.
      showToast(err instanceof Error ? err.message : "Couldn't add that subtask.");
    }
  }

  return (
    <Card>
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-heading-md">
          Milestones <span className="text-ink-muted font-medium text-body">{done} / {goal.milestones.length}</span>
        </h2>
        <Button size="sm" variant="ghost" icon={<Plus className="w-4 h-4" />} onClick={() => setAdding((v) => !v)}>
          Add
        </Button>
      </div>
      {adding && (
        <div className="flex gap-2 mb-3">
          <input
            placeholder="New subtask"
            aria-label="New subtask"
            maxLength={TEXT_LIMITS.milestoneTitle}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 bg-surface-2 border border-border-strong rounded-md p-2.5 text-body-sm outline-none focus:border-gold focus:shadow-focus"
            autoFocus
          />
          <Button size="sm" onClick={handleAdd}>
            Add
          </Button>
        </div>
      )}
      {goal.milestones.length === 0 ? (
        <p className="text-body-sm text-ink-muted">No subtasks yet.</p>
      ) : (
        goal.milestones.map((m) => {
          const overdue = !m.is_done && m.due_date && isPast(m.due_date);
          return (
            <div key={m.id} className="flex items-center gap-3 py-3 border-t border-border first:border-t-0">
              <button
                className={
                  "w-[22px] h-[22px] rounded-[7px] border-[1.5px] grid place-items-center flex-none " +
                  (m.is_done ? "bg-grade-a border-grade-a text-bg" : "border-border-strong")
                }
                onClick={() => updateMilestone.mutate({ milestoneId: m.id, body: { is_done: !m.is_done } })}
                aria-label={m.is_done ? "Mark not done" : "Mark done"}
              >
                {m.is_done && <Check className="w-3.5 h-3.5" />}
              </button>
              <span className={"flex-1 text-body " + (m.is_done ? "text-ink-muted line-through" : "")}>{m.title}</span>
              {m.due_date && (
                <span className={overdue ? "text-grade-d text-body-sm" : "text-ink-muted text-body-sm"}>
                  {overdue ? `Overdue · ${formatShort(m.due_date)}` : formatShort(m.due_date)}
                </span>
              )}
            </div>
          );
        })
      )}
    </Card>
  );
}

function CheckInsCard({ goalId, goal }: { goalId: string; goal: NonNullable<ReturnType<typeof useGoal>["data"]> }) {
  const { data: checkIns, isLoading, isError, refetch } = useCheckIns(goalId, 50);
  const deleteCheckIn = useDeleteCheckIn(goalId);
  const { openCheckIn } = useCheckInModal();

  return (
    <Card>
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-heading-md">Check-ins</h2>
        <span className="text-body-sm text-ink-muted">Effort</span>
      </div>
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : isError ? (
        <ErrorState message="Couldn't load check-ins." onRetry={() => refetch()} />
      ) : !checkIns || checkIns.length === 0 ? (
        <div className="flex flex-col items-center text-center gap-3 py-6">
          <p className="text-body-sm text-ink-muted">No check-ins yet. Log your first one.</p>
          <Button size="sm" onClick={() => openCheckIn(goal.id)}>
            Log check-in
          </Button>
        </div>
      ) : (
        checkIns.map((c) => {
          const d = new Date(c.logged_for);
          return (
            <div key={c.id} className="grid grid-cols-[56px_1fr_auto] gap-4 py-4 border-t border-border first:border-t-0 first:pt-0 items-start">
              <div className="text-center bg-surface-2 rounded-md py-1.5">
                <b className="block font-display text-[18px] leading-[22px]">{String(d.getDate()).padStart(2, "0")}</b>
                <span className="text-[11px] font-semibold uppercase text-ink-muted tracking-wide">
                  {d.toLocaleDateString(undefined, { month: "short" })}
                </span>
              </div>
              <div>
                <p className="text-body">{c.note || "No note."}</p>
                <p className="text-body-sm text-ink-muted mt-0.5">
                  {goal.type === "numeric" && c.value !== null
                    ? `${c.value} ${goal.unit ?? ""}`.trim()
                    : goal.type === "habit"
                      ? "Check-in logged"
                      : c.value !== null
                        ? `${c.value}`
                        : "Logged"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="inline-flex gap-[3px]" aria-label={`Effort ${c.effort_rating} of 5`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <i key={n} className={"w-2 h-2 rounded-full " + (n <= c.effort_rating ? "bg-gold" : "bg-surface-3")} />
                  ))}
                </span>
                <button
                  className="text-ink-subtle hover:text-grade-d"
                  onClick={() => {
                    if (window.confirm("Delete this check-in?")) deleteCheckIn.mutate(c.id);
                  }}
                  aria-label="Delete check-in"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })
      )}
    </Card>
  );
}
