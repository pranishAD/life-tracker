import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Archive, ArchiveRestore, Info, Lock, Pencil, Quote, Trash2 } from "lucide-react";
import Button from "../components/Button";
import CategoryChip, { AddCategoryChip } from "../components/CategoryChip";
import CategoryDialog from "../components/CategoryDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import Disclosure from "../components/Disclosure";
import EmojiColourPicker from "../components/EmojiColourPicker";
import EmojiTile from "../components/EmojiTile";
import ErrorState from "../components/ErrorState";
import FocusedTopBar, { BackButton, MobileFooter, StepDots } from "../components/FocusedTopBar";
import { GoalCardView, goalFooterStat, goalPercent, goalTypeMeta } from "../components/GoalCard";
import SegmentedControl from "../components/SegmentedControl";
import Skeleton from "../components/Skeleton";
import DateField from "../components/goal-form/DateField";
import Field from "../components/goal-form/Field";
import HabitBlock from "../components/goal-form/HabitBlock";
import NumericBlock from "../components/goal-form/NumericBlock";
import SubtaskEditor from "../components/goal-form/SubtaskEditor";
import { useToast } from "../context/ToastContext";
import { MAX_CATEGORIES, useCategories } from "../hooks/useCategories";
import { useHabitExtras } from "../hooks/useGoalExtras";
import { useAddMilestone, useCreateGoal, useDeleteGoal, useGoal, useUpdateGoal } from "../hooks/useGoals";
import { useGoalScore } from "../hooks/useScoring";
import { ApiError } from "../api/client";
import clsx from "../lib/clsx";
import { countdownLabel, formatShort, todayIso } from "../lib/date";
import { expectedPerWeek } from "../lib/frequency";
import { gradeToKey } from "../lib/grade";
import {
  GOAL_NAME_MAX,
  WHY_MAX,
  blankForm,
  buildCreatePayload,
  buildUpdatePayload,
  effectiveDirection,
  formFromGoal,
  formFromTemplate,
  isDirty,
  parseNum,
  validateGoalForm,
  type FormField,
  type GoalFormState,
} from "../lib/goalForm";
import { findTemplate } from "../lib/templates";
import type { Category, Goal, GoalType } from "../api/types";

/**
 * Screens 11 / 11b. One page for both:
 *   /goals/new/details?template=<slug>  → create (blank when no template)
 *   /goals/:goalId/edit                 → edit
 * This outer component only loads data; <GoalForm> holds the form state.
 */
export default function GoalFormPage() {
  const { goalId } = useParams<{ goalId: string }>();
  const [params] = useSearchParams();
  const categoriesQuery = useCategories();
  const goalQuery = useGoal(goalId);
  const isEdit = !!goalId;

  const loading = categoriesQuery.isLoading || (isEdit && goalQuery.isLoading);
  const failed = categoriesQuery.isError || (isEdit && goalQuery.isError);

  if (loading) {
    return (
      <div className="max-w-[1080px] mx-auto px-4 md:px-6 pt-8 flex flex-col gap-5">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[520px]" />
      </div>
    );
  }
  if (failed || !categoriesQuery.data || (isEdit && !goalQuery.data)) {
    return (
      <div className="max-w-[640px] mx-auto px-4 pt-12">
        <ErrorState
          message={isEdit ? "Couldn't load this goal." : "Couldn't load your categories."}
          onRetry={() => {
            categoriesQuery.refetch();
            if (isEdit) goalQuery.refetch();
          }}
        />
      </div>
    );
  }

  const categories = categoriesQuery.data;
  const template = findTemplate(params.get("template"));
  const typeParam = params.get("type");
  const initial: GoalFormState = isEdit
    ? formFromGoal(goalQuery.data!)
    : template
      ? formFromTemplate(template, categories)
      : blankForm(categories, {
          type: (["numeric", "habit", "milestone"] as const).find((t) => t === typeParam),
          categoryId: params.get("category") ?? undefined,
        });

  return (
    <GoalForm
      // `key` makes React start a fresh form if the template/goal changes.
      key={goalId ?? template?.slug ?? "blank"}
      mode={isEdit ? "edit" : "create"}
      goal={goalQuery.data}
      templateName={template?.name}
      categories={categories}
      initial={initial}
    />
  );
}

const TYPE_HELP: Record<GoalType, string> = {
  numeric: "Numeric: you log a number each time (a weight, a time, an amount).",
  habit: "Habit: you check in each time you do it. Bihan counts how often.",
  milestone: "Milestone: tick off subtasks before a due date.",
};

interface GoalFormProps {
  mode: "create" | "edit";
  goal?: Goal;
  templateName?: string;
  categories: Category[];
  initial: GoalFormState;
}

function GoalForm({ mode, goal, templateName, categories, initial }: GoalFormProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isEdit = mode === "edit";

  // The whole form is one state object; `update` merges in a partial change.
  const [form, setForm] = useState<GoalFormState>(initial);
  const update = useCallback((patch: Partial<GoalFormState>) => setForm((f) => ({ ...f, ...patch })), []);

  // Errors are always computed, but a field only shows its error once the
  // user has changed it (or after a save attempt) — no red on a fresh form.
  const [touched, setTouched] = useState<Set<FormField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const errors = useMemo(() => validateGoalForm(form, { mode, goal }), [form, mode, goal]);
  const shownErrors = useMemo(() => {
    const out: typeof errors = {};
    for (const [k, v] of Object.entries(errors) as [FormField, string][]) {
      if (submitted || touched.has(k) || k === "direction") out[k] = v;
    }
    return out;
  }, [errors, touched, submitted]);
  const isValid = Object.keys(errors).length === 0;

  /** update() + mark the given fields as touched. */
  function change(patch: Partial<GoalFormState>, ...fields: FormField[]) {
    update(patch);
    setTouched((t) => new Set([...t, ...fields]));
  }

  // Edit: open "More options" by itself when something inside was set —
  // a "why", or a start date different from the day the goal was created.
  const [moreOpen, setMoreOpen] = useState(
    isEdit && (!!initial.why || (!!goal && goal.start_date !== goal.created_at.slice(0, 10))),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [confirm, setConfirm] = useState<"discard" | "delete" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const tileRef = useRef<HTMLButtonElement>(null);

  const dirty = isDirty(form, initial);
  // Set right before we navigate away on purpose (after save/delete) so the
  // unsaved-changes guard doesn't fire.
  const leavingRef = useRef(false);

  // Browser-level guard: refresh / close tab with unsaved changes. (In-app
  // links on this page go through `leave()` below, which asks first.)
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const backTo = isEdit ? `/goals/${goal!.id}` : "/goals/new";
  function leave() {
    if (dirty) setConfirm("discard");
    else navigate(backTo);
  }

  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal(goal?.id ?? "");
  const deleteGoal = useDeleteGoal();
  const addMilestone = useAddMilestone(goal?.id ?? "");
  const saving = createGoal.isPending || updateGoal.isPending || addMilestone.isPending;

  const category = categories.find((c) => c.id === form.categoryId) ?? categories[0];
  const identity = {
    emoji: form.emoji ?? category?.emoji ?? "✨",
    color: form.color ?? category?.color ?? "slate",
  };
  const typeLocked = isEdit && (goal?.check_in_count ?? 0) > 0;
  // Subtasks are edited here on create, or when an edit switches a goal *to*
  // milestone. An existing milestone goal manages them on its detail page.
  const editsSubtasks = form.type === "milestone" && (!isEdit || goal?.type !== "milestone");

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    setSubmitted(true);
    setFormError(null);
    if (!isValid) return;
    try {
      if (!isEdit) {
        const created = await createGoal.mutateAsync(buildCreatePayload(form));
        leavingRef.current = true;
        showToast("Goal created. Log your first check-in when you're ready.");
        navigate(`/goals/${created.id}`, { replace: true });
        return;
      }
      const body = buildUpdatePayload(form, goal!);
      if (Object.keys(body).length > 0) await updateGoal.mutateAsync(body);
      if (editsSubtasks) {
        // Switched to milestone: create the subtasks in order.
        for (const t of form.subtasks.filter((s) => s.title.trim())) {
          await addMilestone.mutateAsync({ title: t.title.trim() });
        }
      }
      leavingRef.current = true;
      if (Object.keys(body).length > 0) showToast("Changes saved.");
      navigate(`/goals/${goal!.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "TYPE_LOCKED") {
        setFormError("This goal already has check-ins, so its type can't change.");
      } else if (err instanceof ApiError && err.code === "INVALID_CATEGORY") {
        setFormError("That category no longer exists. Pick another one.");
      } else {
        setFormError(err instanceof Error ? err.message : "Couldn't save this goal.");
      }
    }
  }

  async function setArchived(archived: boolean) {
    try {
      await updateGoal.mutateAsync({ status: archived ? "archived" : "active" });
      leavingRef.current = true;
      showToast(archived ? "Goal archived. Find it under Goals › Archived." : "Goal restored to Active.");
      navigate(archived ? "/goals" : `/goals/${goal!.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't update this goal.");
    }
  }

  async function handleDelete() {
    try {
      await deleteGoal.mutateAsync(goal!.id);
      leavingRef.current = true;
      setConfirm(null);
      showToast(`Deleted "${goal!.title}".`);
      navigate("/goals", { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't delete this goal.");
      setConfirm(null);
    }
  }

  const primaryLabel = saving ? "Saving…" : isEdit ? "Save changes" : "Create goal";
  const primaryDisabled = saving || !isValid;

  return (
    <div className="min-h-screen bg-bg text-ink">
      <FocusedTopBar
        left={<BackButton onClick={leave}>{isEdit ? "Goal" : "Templates"}</BackButton>}
        center={
          isEdit ? (
            <span className="text-body-sm font-semibold text-ink-muted">Edit goal</span>
          ) : (
            <StepDots step={2} total={2} text="Step 2 of 2 · Details" />
          )
        }
        right={
          <>
            {isEdit && (
              <Button size="sm" variant="ghost" onClick={leave}>
                Cancel
              </Button>
            )}
            <Button size="sm" className="px-4" disabled={primaryDisabled} onClick={() => handleSubmit()}>
              {primaryLabel}
            </Button>
          </>
        }
      />

      <main className="max-w-[1080px] mx-auto px-4 pt-5 pb-[120px] md:px-6 md:pt-8 md:pb-12">
        <div className="mb-6">
          <h1 className="text-display-mobile md:text-display">{isEdit ? "Edit goal" : "New goal"}</h1>
          <p className="text-body text-ink-muted mt-1.5">
            {isEdit
              ? `Started ${formatShort(goal!.start_date)} · ${goal!.check_in_count} check-in${goal!.check_in_count === 1 ? "" : "s"}`
              : templateName
                ? `From template: ${templateName}`
                : "Name it, pick a type, done in 30 seconds."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] gap-6 md:gap-8 items-start">
          <form
            onSubmit={handleSubmit}
            noValidate
            aria-label={isEdit ? "Edit goal" : "New goal"}
            className="bg-surface-1 border border-border rounded-lg p-4 md:p-6 flex flex-col gap-6"
          >
            {formError && (
              <div className="bg-grade-d-dim text-grade-d rounded-md px-3 py-2.5 text-body-sm" role="alert">
                {formError}
              </div>
            )}

            {/* 1. Identity row */}
            <div className="flex gap-4 items-end">
              <div className="relative">
                <button
                  ref={tileRef}
                  type="button"
                  aria-label="Change emoji and colour"
                  aria-expanded={pickerOpen}
                  onClick={() => setPickerOpen((v) => !v)}
                  className="relative block rounded-lg focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <EmojiTile emoji={identity.emoji} color={identity.color} size="lg" />
                  <span className="absolute -right-1 -bottom-1 w-[22px] h-[22px] rounded-full bg-surface-3 border-2 border-surface-1 grid place-items-center text-ink">
                    <Pencil className="w-3 h-3" strokeWidth={2} />
                  </span>
                </button>
                {pickerOpen && (
                  <EmojiColourPicker
                    anchorRef={tileRef}
                    emoji={identity.emoji}
                    color={identity.color}
                    goalName={form.title}
                    onEmoji={(emoji) => update({ emoji })}
                    onColor={(color) => update({ color })}
                    onClose={() => setPickerOpen(false)}
                  />
                )}
              </div>
              <Field label="Goal name" htmlFor="goal-name" error={shownErrors.title} className="flex-1">
                <input
                  id="goal-name"
                  value={form.title}
                  maxLength={Math.max(GOAL_NAME_MAX, initial.title.length)}
                  onChange={(e) => change({ title: e.target.value }, "title")}
                  placeholder="e.g. Run 5 km under 28 min"
                  aria-invalid={!!shownErrors.title}
                  className={clsx(
                    "bg-surface-2 border rounded-md px-3.5 py-3 text-[20px] leading-7 font-semibold placeholder:text-ink-subtle placeholder:font-normal outline-none focus:border-gold focus:shadow-focus w-full",
                    shownErrors.title ? "border-grade-d" : "border-border-strong",
                  )}
                />
              </Field>
            </div>

            {/* 2. Category */}
            <Field label="Category" error={shownErrors.categoryId}>
              <div className="flex gap-2 overflow-x-auto md:flex-wrap -mr-4 md:mr-0 pr-4 md:pr-0 pb-1 [scrollbar-width:none]" role="group" aria-label="Category">
                {categories.map((c) => (
                  <CategoryChip
                    key={c.id}
                    category={c}
                    size="lg"
                    selected={c.id === form.categoryId}
                    onClick={() => change({ categoryId: c.id }, "categoryId")}
                  />
                ))}
                <AddCategoryChip
                  onClick={() => setCategoryDialog(true)}
                  disabled={categories.length >= MAX_CATEGORIES}
                  title={categories.length >= MAX_CATEGORIES ? "You have 12 categories, the most allowed." : undefined}
                />
              </div>
            </Field>

            {/* 3. Type */}
            <Field
              label="Type"
              help={
                typeLocked ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-subtle">
                    <Lock className="w-4 h-4" strokeWidth={2} />
                    Type can't change once a goal has check-ins.
                  </span>
                ) : (
                  TYPE_HELP[form.type]
                )
              }
            >
              <SegmentedControl<GoalType>
                label="Goal type"
                value={form.type}
                disabled={typeLocked}
                onChange={(type) => change({ type }, "subtasks")}
                options={[
                  { value: "numeric", label: "Numeric" },
                  { value: "habit", label: "Habit" },
                  { value: "milestone", label: "Milestone" },
                ]}
              />
            </Field>

            {/* 4. Type block */}
            <div className="bg-surface-2 rounded-lg p-4 flex flex-col gap-4">
              {form.type === "numeric" && (
                <NumericBlock
                  form={form}
                  update={(patch) => change(patch, ...(Object.keys(patch) as FormField[]))}
                  errors={shownErrors}
                  currentValue={isEdit && goal!.check_in_count > 0 ? goal!.current_value : undefined}
                />
              )}
              {form.type === "habit" && (
                <HabitBlock
                  form={form}
                  update={(patch) => change(patch, "timesPerWeek", "weekdays")}
                  errors={shownErrors}
                  stepperMax={goal?.frequency_per_week ?? undefined}
                />
              )}
              {form.type === "milestone" &&
                (editsSubtasks ? (
                  <SubtaskEditor
                    subtasks={form.subtasks}
                    onChange={(subtasks) => change({ subtasks }, "subtasks")}
                    error={shownErrors.subtasks}
                  />
                ) : (
                  <p className="text-body-sm text-ink-muted">
                    {goal!.milestones.length} subtask{goal!.milestones.length === 1 ? "" : "s"}. Add, tick off or
                    remove them on the goal page.
                  </p>
                ))}
            </div>

            {/* 5. Target date */}
            <Field
              label="Target date"
              hint={form.type === "milestone" ? "required" : "optional"}
              htmlFor="goal-deadline"
              error={shownErrors.deadline}
              help="With a date, Bihan can tell if you're ahead or behind pace."
            >
              <DateField
                id="goal-deadline"
                value={form.deadline}
                onChange={(deadline) => change({ deadline }, "deadline", "startDate")}
                placeholder="No end date"
                aside={form.deadline ? countdownLabel(form.deadline) : undefined}
                min={form.startDate || undefined}
                clearable={form.type !== "milestone"}
                invalid={!!shownErrors.deadline}
              />
            </Field>

            {/* More options */}
            <Disclosure
              open={moreOpen}
              onToggle={() => setMoreOpen((v) => !v)}
              title="More options"
              summary="Why this matters, start date"
            >
              <Field label="Why this matters" hint="optional" htmlFor="goal-why" error={shownErrors.why}>
                <textarea
                  id="goal-why"
                  rows={3}
                  value={form.why}
                  maxLength={WHY_MAX}
                  onChange={(e) => change({ why: e.target.value }, "why")}
                  placeholder="e.g. Play futsal again without getting gassed"
                  aria-describedby="goal-why-help"
                  className="bg-surface-2 border border-border-strong rounded-md p-3 text-body placeholder:text-ink-subtle outline-none resize-none focus:border-gold focus:shadow-focus"
                />
                <div id="goal-why-help" className="flex justify-between gap-2 text-body-sm text-ink-muted">
                  <span className="flex gap-1.5 items-start">
                    <Quote className="w-4 h-4 text-gold flex-none mt-px" strokeWidth={2} />
                    Shown on the check-in screen, as a reminder.
                  </span>
                  <span className="text-[12px] text-ink-subtle whitespace-nowrap tabular-nums">
                    {form.why.length} / {WHY_MAX}
                  </span>
                </div>
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Start date" htmlFor="goal-start-date" error={shownErrors.startDate}>
                  <DateField
                    id="goal-start-date"
                    value={form.startDate}
                    onChange={(startDate) => change({ startDate }, "startDate")}
                    max={form.deadline || undefined}
                    invalid={!!shownErrors.startDate}
                  />
                </Field>
              </div>
            </Disclosure>

            {/* Archive or delete (edit only) */}
            {isEdit && (
              <div className="border-t border-border pt-5 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div>
                  <b className="block text-[15px] leading-5 font-semibold">Archive or delete</b>
                  <p className="text-body-sm text-ink-muted mt-0.5">
                    Archive hides the goal and keeps its history. Delete removes it for good.
                  </p>
                </div>
                <div className="flex gap-2">
                  {goal!.status === "archived" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="flex-1 md:flex-none justify-center"
                      icon={<ArchiveRestore className="w-4 h-4" />}
                      onClick={() => setArchived(false)}
                    >
                      Restore
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="flex-1 md:flex-none justify-center"
                      icon={<Archive className="w-4 h-4" />}
                      onClick={() => setArchived(true)}
                    >
                      Archive
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    className="flex-1 md:flex-none justify-center"
                    icon={<Trash2 className="w-4 h-4" />}
                    onClick={() => setConfirm("delete")}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            )}

            {/* Lets Enter in a text field submit the form. */}
            <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
          </form>

          <PreviewAside form={form} goal={goal} category={category} identity={identity} dirty={dirty} />
        </div>
      </main>

      <MobileFooter>
        <Button className="w-full justify-center" disabled={primaryDisabled} onClick={() => handleSubmit()}>
          {primaryLabel}
        </Button>
      </MobileFooter>

      {categoryDialog && (
        <CategoryDialog
          eyebrow={isEdit ? "Edit goal · Category" : "New goal · Category"}
          onClose={() => setCategoryDialog(false)}
          onSaved={(c) => change({ categoryId: c.id }, "categoryId")}
        />
      )}

      {confirm === "discard" && (
        <ConfirmDialog
          title="Discard changes?"
          message="You have changes that aren't saved yet. Leave without saving them?"
          confirmLabel="Discard"
          destructive
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            leavingRef.current = true;
            navigate(backTo);
          }}
        />
      )}
      {confirm === "delete" && goal && (
        <ConfirmDialog
          title={`Delete "${goal.title}"?`}
          message="This removes the goal and all its check-ins for good. Archive it instead if you might want it back."
          confirmLabel="Delete goal"
          busyLabel="Deleting…"
          busy={deleteGoal.isPending}
          destructive
          onCancel={() => setConfirm(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

/** Desktop-only live preview: the real GoalCard look, updated as you type. */
function PreviewAside({
  form,
  goal,
  category,
  identity,
  dirty,
}: {
  form: GoalFormState;
  goal?: Goal;
  category: Category | undefined;
  identity: { emoji: string; color: Goal["category"]["color"] };
  dirty: boolean;
}) {
  // Edit: show the goal's real score + stats. Create: Calibrating.
  const { data: score } = useGoalScore(goal?.id);
  const { checkInsThisWeek, streakDays } = useHabitExtras(goal ?? ({ type: "numeric" } as Goal));
  const draft = draftGoal(form, goal, category);
  const gradeKey = goal && score ? gradeToKey(score.grade) : "cal";
  const footer = goal
    ? goalFooterStat(draft, { isCal: gradeKey === "cal", checkInsThisWeek, streakDays, pace: score?.pace })
    : { text: form.startDate === todayIso() ? "Starts today" : `Starts ${formatShort(form.startDate || todayIso())}`, warn: false };

  return (
    <aside className="hidden md:flex flex-col gap-4 sticky top-24" aria-label="Preview">
      <div className="flex justify-between items-center">
        <span className="text-label uppercase text-ink-muted">Preview</span>
        <span className="text-[12px] text-ink-muted">{goal ? (dirty ? "Unsaved changes" : "No changes yet") : "How it shows in Goals"}</span>
      </div>
      <GoalCardView
        title={form.title.trim()}
        emoji={identity.emoji}
        color={identity.color}
        category={category ?? { name: "Category", emoji: "✨" }}
        gradeKey={gradeKey}
        score={goal ? (score?.total ?? null) : null}
        percent={goal ? goalPercent(draft, checkInsThisWeek) : 0}
        typeMeta={goalTypeMeta(draft, checkInsThisWeek)}
        footer={footer}
      />
      <div className="flex gap-3 text-body-sm text-ink-muted px-1">
        <Info className="w-4 h-4 text-gold flex-none mt-px" strokeWidth={2} />
        <span>
          {goal
            ? "Changing the schedule only affects days from today on. Past check-ins and scores stay as they are."
            : "Your grade shows up after 3 days of check-ins. Until then it's Calibrating."}
        </span>
      </div>
    </aside>
  );
}

/** A Goal-shaped object built from the form, so the preview can reuse the
 * same meta/percent helpers as the real card. */
function draftGoal(form: GoalFormState, goal: Goal | undefined, category: Category | undefined): Goal {
  const start = parseNum(form.startValue) ?? 0;
  const freqPerWeek = expectedPerWeek({
    frequency_type: form.frequencyType,
    frequency_per_week: form.timesPerWeek,
    weekdays: form.weekdays,
  });
  return {
    id: goal?.id ?? "draft",
    user_id: goal?.user_id ?? "",
    description: goal?.description ?? null,
    created_at: goal?.created_at ?? new Date().toISOString(),
    weight: goal?.weight ?? 1,
    status: goal?.status ?? "active",
    archived_at: goal?.archived_at ?? null,
    check_in_count: goal?.check_in_count ?? 0,
    current_value: goal && goal.check_in_count > 0 ? goal.current_value : start,
    title: form.title,
    category_id: form.categoryId,
    category: category ?? { id: "", name: "", emoji: "✨", color: "slate" },
    emoji: form.emoji,
    color: form.color,
    type: form.type,
    start_value: start,
    target_value: parseNum(form.targetValue),
    unit: form.unit.trim() || null,
    direction: effectiveDirection(form),
    frequency_type: form.frequencyType,
    frequency_per_week: freqPerWeek,
    weekdays: form.weekdays,
    why: form.why || null,
    start_date: form.startDate || todayIso(),
    deadline: form.deadline || null,
    milestones:
      goal?.type === "milestone" && form.type === "milestone"
        ? goal.milestones
        : form.subtasks.map((t) => ({ id: t.key, goal_id: "", title: t.title, due_date: null, is_done: false, done_at: null })),
  };
}
