import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import Button from "./Button";
import { Input } from "./Input";
import clsx from "../lib/clsx";
import { CATEGORIES, CATEGORY_LABELS } from "../lib/category";
import { useCreateGoal, useUpdateGoal } from "../hooks/useGoals";
import { todayIso } from "../lib/date";
import { NUMBER_LIMITS, TEXT_LIMITS } from "../lib/limits";
import type { Category, Goal, GoalType } from "../api/types";

const TYPES: { value: GoalType; label: string; hint: string }[] = [
  { value: "numeric", label: "Numeric", hint: "Track a target value, e.g. 80 kg" },
  { value: "habit", label: "Habit", hint: "Track a weekly frequency, e.g. 5x / week" },
  { value: "milestone", label: "Milestone", hint: "Track subtasks toward a deadline" },
];

interface GoalFormModalProps {
  onClose: () => void;
  /** Present => editing; absent => creating. */
  goal?: Goal;
  /** Prefill for the dashboard empty-state "starter" cards. */
  initial?: { title: string; category: Category; type: GoalType };
}

/** Create/edit goal form. components.md doesn't mock a dedicated screen for
 * this, so it's built in the spirit of the rest of the system (Card + Input
 * + pill selectors) — flagged in the handoff note as a reasonable addition
 * needed to complete the create -> check-in loop. */
export default function GoalFormModal({ onClose, goal, initial }: GoalFormModalProps) {
  const isEdit = !!goal;
  const [title, setTitle] = useState(goal?.title ?? initial?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [category, setCategory] = useState<Category>(goal?.category ?? initial?.category ?? "fitness");
  const [type] = useState<GoalType>(goal?.type ?? initial?.type ?? "numeric");
  const [targetValue, setTargetValue] = useState(goal?.target_value?.toString() ?? "");
  const [unit, setUnit] = useState(goal?.unit ?? "");
  const [frequency, setFrequency] = useState(goal?.frequency_per_week?.toString() ?? "3");
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");
  const [error, setError] = useState<string | null>(null);

  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal(goal?.id ?? "");
  const isSaving = createGoal.isPending || updateGoal.isPending;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Give this goal a title.");
      return;
    }
    // Same number ranges the backend enforces (docs/api-contract.yaml).
    if (type === "numeric" && targetValue !== "") {
      const t = Number(targetValue);
      if (!(t > 0 && t < NUMBER_LIMITS.targetValueMaxExclusive)) {
        setError("Target value must be more than 0 and less than 10,000,000,000.");
        return;
      }
    }
    if (type === "habit") {
      const f = Number(frequency);
      if (!Number.isInteger(f) || f < NUMBER_LIMITS.frequencyMin || f > NUMBER_LIMITS.frequencyMax) {
        setError(`Times per week must be a whole number from ${NUMBER_LIMITS.frequencyMin} to ${NUMBER_LIMITS.frequencyMax}.`);
        return;
      }
    }
    try {
      if (isEdit && goal) {
        await updateGoal.mutateAsync({
          title,
          description: description || null,
          category,
          target_value: type === "numeric" ? Number(targetValue) || null : undefined,
          unit: type === "numeric" ? unit || null : undefined,
          frequency_per_week: type === "habit" ? Number(frequency) || null : undefined,
          deadline: deadline || null,
        });
      } else {
        await createGoal.mutateAsync({
          title,
          description: description || null,
          category,
          type,
          start_date: todayIso(),
          target_value: type === "numeric" ? Number(targetValue) || null : null,
          unit: type === "numeric" ? unit || null : null,
          frequency_per_week: type === "habit" ? Number(frequency) || null : null,
          deadline: type !== "habit" ? deadline || null : null,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this goal.");
    }
  }

  return (
    <div className="fixed inset-0 z-20 bg-overlay backdrop-blur-sm grid place-items-center p-0 md:p-6" onClick={onClose}>
      <form
        className="w-full md:max-w-modal bg-surface-1 border border-border rounded-t-xl md:rounded-xl shadow-modal p-4 md:p-8 max-h-[94vh] overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="flex justify-between items-start">
          <h2 className="font-display text-[22px] font-semibold">{isEdit ? "Edit goal" : "New goal"}</h2>
          <button type="button" className="w-9 h-9 rounded-full bg-surface-2 grid place-items-center text-ink-muted" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && <div className="bg-grade-d-dim text-grade-d rounded-md px-3 py-2.5 text-body-sm">{error}</div>}

        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TEXT_LIMITS.goalTitle}
          required
        />
        <Input
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={TEXT_LIMITS.goalDescription}
        />

        <div className="flex flex-col gap-2">
          <span className="text-body-sm font-medium text-ink-muted">Category</span>
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setCategory(c)}
                className={clsx(
                  "px-3.5 py-2 rounded-full border text-body-sm font-medium",
                  category === c ? "bg-ink text-bg border-ink" : "border-border text-ink-muted",
                )}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        {!isEdit && (
          <div className="flex flex-col gap-2">
            <span className="text-body-sm font-medium text-ink-muted">Type</span>
            <div className="bg-surface-2 rounded-md px-3 py-2.5 text-body-sm text-ink-muted">
              {TYPES.find((t) => t.value === type)?.hint}
              <div className="flex gap-2 mt-2">
                {TYPES.map((t) => (
                  <span
                    key={t.value}
                    className={clsx(
                      "px-3 py-1.5 rounded-full text-body-sm",
                      type === t.value ? "bg-surface-3 text-ink" : "text-ink-subtle",
                    )}
                  >
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {type === "numeric" && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Target value"
              type="number"
              step="any"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
            />
            <Input
              label="Unit"
              placeholder="kg, pages…"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              maxLength={TEXT_LIMITS.goalUnit}
            />
          </div>
        )}

        {type === "habit" && (
          <Input
            label="Times per week"
            type="number"
            min={NUMBER_LIMITS.frequencyMin}
            max={NUMBER_LIMITS.frequencyMax}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
          />
        )}

        {type !== "habit" && (
          <Input label="Deadline (optional)" type="date" value={deadline ?? ""} onChange={(e) => setDeadline(e.target.value)} />
        )}

        <Button type="submit" disabled={isSaving} className="w-full justify-center mt-2">
          {isSaving ? "Saving…" : isEdit ? "Save changes" : "Create goal"}
        </Button>
      </form>
    </div>
  );
}
