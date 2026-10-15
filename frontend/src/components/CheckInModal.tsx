import { useEffect, useMemo, useState } from "react";
import { Calendar, Check, ChevronDown, TrendingUp, X } from "lucide-react";
import Button from "./Button";
import ScoreRing from "./ScoreRing";
import { Textarea } from "./Input";
import clsx from "../lib/clsx";
import { gradeToKey } from "../lib/grade";
import { useGoals, useUpdateMilestone } from "../hooks/useGoals";
import { useCreateCheckIn } from "../hooks/useCheckIns";
import { useGoalScore } from "../hooks/useScoring";
import { useToast } from "../context/ToastContext";
import { addDays, todayIso } from "../lib/date";

const EFFORT_LABELS = ["Easy", "Light", "Solid", "Hard", "All out"];

interface CheckInModalProps {
  /** Preselect a goal (e.g. opened from that goal's detail page). */
  goalId?: string;
  onClose: () => void;
}

/** "Log check-in" modal (desktop dialog / mobile bottom sheet), per
 * design/components.md "Check-in modal". */
export default function CheckInModal({ goalId, onClose }: CheckInModalProps) {
  const { data: goals, isLoading: goalsLoading } = useGoals({ status: "active" });
  const [selectedGoalId, setSelectedGoalId] = useState<string | undefined>(goalId);

  useEffect(() => {
    if (!selectedGoalId && goals && goals.length > 0) setSelectedGoalId(goals[0].id);
  }, [goals, selectedGoalId]);

  const selectedGoal = goals?.find((g) => g.id === selectedGoalId);
  const { data: score } = useGoalScore(selectedGoalId);
  const { showToast } = useToast();

  const [value, setValue] = useState("");
  const [effort, setEffort] = useState<number | null>(null);
  const [dateChoice, setDateChoice] = useState<"today" | "yesterday" | "custom">("today");
  const [customDate, setCustomDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [milestoneId, setMilestoneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createCheckIn = useCreateCheckIn(selectedGoalId ?? "");
  const updateMilestone = useUpdateMilestone(selectedGoalId ?? "");

  const loggedFor = useMemo(() => {
    if (dateChoice === "today") return todayIso();
    if (dateChoice === "yesterday") return addDays(todayIso(), -1);
    return customDate;
  }, [dateChoice, customDate]);

  const currentBest = selectedGoal
    ? selectedGoal.type === "numeric"
      ? `Current best: ${selectedGoal.current_value ?? 0} ${selectedGoal.unit ?? ""}`.trim()
      : selectedGoal.type === "milestone"
        ? `${selectedGoal.milestones.filter((m) => m.is_done).length} / ${selectedGoal.milestones.length} done`
        : "Logging keeps your streak going"
    : "";

  async function handleSave() {
    setError(null);
    if (!selectedGoalId) {
      setError("Pick a goal first.");
      return;
    }
    if (!effort) {
      setError("Pick an effort rating.");
      return;
    }
    try {
      await createCheckIn.mutateAsync({
        value: selectedGoal?.type === "numeric" && value !== "" ? Number(value) : undefined,
        note: note || undefined,
        effort_rating: effort,
        logged_for: loggedFor,
      });
      if (selectedGoal?.type === "milestone" && milestoneId) {
        await updateMilestone.mutateAsync({ milestoneId, body: { is_done: true } });
      }
      showToast("Check-in saved.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this check-in.");
    }
  }

  const gradeKey = score ? gradeToKey(score.grade) : "cal";
  const incompleteMilestones = selectedGoal?.milestones.filter((m) => !m.is_done) ?? [];

  return (
    <div className="fixed inset-0 z-20 bg-overlay backdrop-blur-sm grid place-items-center md:p-6" onClick={onClose}>
      <section
        role="dialog"
        aria-label="Log check-in"
        className="w-full md:max-w-modal bg-surface-1 border border-border rounded-t-xl md:rounded-xl shadow-modal p-4 pt-3 md:p-8 max-h-[94vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 rounded-sm bg-surface-3 mx-auto mb-4 md:hidden" />
        <div className="flex justify-between items-start mb-4 md:mb-6">
          <div>
            <p className="text-label text-ink-muted mb-1">Log check-in</p>
            <h2 className="font-display text-[22px] font-semibold">How did it go?</h2>
          </div>
          <button className="w-9 h-9 rounded-full bg-surface-2 grid place-items-center text-ink-muted" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Goal picker: a real <select> overlaid on the styled row so it stays
            a native, accessible control while matching the design visually. */}
        <div className="relative flex items-center gap-3 bg-surface-2 rounded-md p-3 mb-4 md:mb-5">
          {goalsLoading ? (
            <div className="h-10 w-full bg-surface-3 rounded animate-pulse" />
          ) : selectedGoal ? (
            <>
              <ScoreRing score={score?.total ?? null} grade={gradeKey} size={40} strokeWidth={4} scoreFontSize={13} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-body truncate">{selectedGoal.title}</div>
                <div className="text-body-sm text-ink-muted truncate">{currentBest}</div>
              </div>
              {!goalId && <ChevronDown className="w-4 h-4 text-ink-muted flex-none" />}
              {!goalId && (
                <select
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  value={selectedGoalId}
                  onChange={(e) => {
                    setSelectedGoalId(e.target.value);
                    setMilestoneId(null);
                  }}
                >
                  {goals?.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              )}
            </>
          ) : (
            <p className="text-body-sm text-ink-muted">No active goals yet — create one first.</p>
          )}
        </div>

        <div className="flex flex-col gap-4 md:gap-5">
          {selectedGoal?.type === "numeric" && (
            <label className="flex flex-col gap-2">
              <span className="text-body-sm font-medium text-ink-muted">Value</span>
              <div className="flex items-center bg-surface-2 border border-gold shadow-focus rounded-md">
                <input
                  type="number"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={String(selectedGoal.current_value ?? 0)}
                  className="flex-1 min-w-0 bg-transparent border-0 text-ink font-display font-bold text-2xl md:text-[28px] p-3 md:p-4 outline-none"
                />
                <span className="pr-4 text-ink-muted font-semibold">{selectedGoal.unit}</span>
              </div>
            </label>
          )}

          {selectedGoal?.type === "habit" && (
            <p className="text-body-sm text-ink-muted hidden md:block">
              Habit goals skip this: the check-in itself counts.
            </p>
          )}

          {selectedGoal?.type === "milestone" && incompleteMilestones.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-body-sm font-medium text-ink-muted">Mark a subtask done (optional)</span>
              <div className="flex flex-col gap-2">
                {incompleteMilestones.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMilestoneId(milestoneId === m.id ? null : m.id)}
                    className={clsx(
                      "flex items-center gap-2 text-left px-3 py-2 rounded-md border text-body-sm",
                      milestoneId === m.id ? "border-gold bg-grade-s-dim text-gold" : "border-border-strong text-ink",
                    )}
                  >
                    <span
                      className={clsx(
                        "w-4 h-4 rounded-[4px] border grid place-items-center flex-none",
                        milestoneId === m.id ? "bg-gold border-gold text-ink-on-gold" : "border-border-strong",
                      )}
                    >
                      {milestoneId === m.id && <Check className="w-3 h-3" />}
                    </span>
                    {m.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-body-sm font-medium text-ink-muted">Effort</span>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setEffort(n)}
                  className={clsx(
                    "flex flex-col items-center gap-0.5 py-2.5 rounded-md border font-display font-bold text-[17px]",
                    effort === n
                      ? "bg-grade-s-dim border-gold text-gold"
                      : "bg-surface-2 border-transparent text-ink-muted",
                  )}
                >
                  {n}
                  <small className="font-sans font-medium text-[11px]">{EFFORT_LABELS[n - 1]}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-body-sm font-medium text-ink-muted">Date</span>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setDateChoice("today")}
                className={clsx(
                  "px-3.5 py-2 rounded-full text-body-sm font-medium",
                  dateChoice === "today" ? "bg-ink text-bg" : "bg-surface-2 text-ink-muted",
                )}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setDateChoice("yesterday")}
                className={clsx(
                  "px-3.5 py-2 rounded-full text-body-sm font-medium",
                  dateChoice === "yesterday" ? "bg-ink text-bg" : "bg-surface-2 text-ink-muted",
                )}
              >
                Yesterday
              </button>
              <label
                className={clsx(
                  "px-3.5 py-2 rounded-full text-body-sm font-medium inline-flex items-center gap-1.5 cursor-pointer",
                  dateChoice === "custom" ? "bg-ink text-bg" : "bg-surface-2 text-ink-muted",
                )}
              >
                <Calendar className="w-4 h-4" />
                Pick date
                <input
                  type="date"
                  className="sr-only"
                  max={todayIso()}
                  value={customDate}
                  onChange={(e) => {
                    setCustomDate(e.target.value);
                    setDateChoice("custom");
                  }}
                />
              </label>
            </div>
          </div>

          <Textarea
            label="Note (optional)"
            placeholder="What went well? What got in the way?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {error && <p className="text-grade-d text-body-sm mt-4">{error}</p>}

        <div className="flex flex-col-reverse md:flex-row justify-between items-center gap-3 mt-5 md:mt-6">
          <div className="flex items-center gap-2 text-body-sm text-ink-muted justify-center">
            <TrendingUp className="w-4 h-4" />
            {score?.total !== null && score?.total !== undefined
              ? `Current score: ${score.total}`
              : "Score updates after you save."}
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Button variant="ghost" onClick={onClose} className="hidden md:inline-flex">
              Cancel
            </Button>
            <Button
              icon={<Check className="w-5 h-5" />}
              onClick={handleSave}
              disabled={createCheckIn.isPending || !selectedGoal}
              className="flex-1 md:flex-none justify-center"
            >
              {createCheckIn.isPending ? "Saving…" : "Save check-in"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
