// The goal create/edit form (screens 11 / 11b) as plain data + functions.
// Keeping the rules here — not inside the React component — means they're
// easy to unit test and the page component stays about layout.
import type {
  Category,
  FrequencyType,
  Goal,
  GoalCreateRequest,
  GoalType,
  GoalUpdateRequest,
  IdentityColor,
  NumericDirection,
  Weekday,
} from "../api/types";
import { addDays, todayIso } from "./date";
import { NUMBER_LIMITS, TEXT_LIMITS } from "./limits";
import type { GoalTemplate } from "./templates";
import { resolveTemplateCategory } from "./templates";

export interface SubtaskDraft {
  /** Local-only id so React can track rows while they're dragged. */
  key: string;
  title: string;
}

export interface GoalFormState {
  title: string;
  /** null = use the category's emoji / colour. */
  emoji: string | null;
  color: IdentityColor | null;
  categoryId: string;
  type: GoalType;
  // numeric (kept as strings while typing, so "" and "7." are allowed)
  startValue: string;
  targetValue: string;
  unit: string;
  direction: NumericDirection;
  /** true once the user picks a direction by hand (stops the auto-set). */
  directionTouched: boolean;
  // habit
  frequencyType: FrequencyType;
  timesPerWeek: number;
  weekdays: Weekday[];
  // milestone (create only — on edit, subtasks are managed on Goal detail)
  subtasks: SubtaskDraft[];
  deadline: string; // "" = no target date
  why: string;
  startDate: string;
}

export type FormField =
  | "title"
  | "categoryId"
  | "startValue"
  | "targetValue"
  | "unit"
  | "direction"
  | "timesPerWeek"
  | "weekdays"
  | "subtasks"
  | "deadline"
  | "why"
  | "startDate";

export type FormErrors = Partial<Record<FormField, string>>;

export const GOAL_NAME_MAX = 60;
export const WHY_MAX = 140;
export const TIMES_PER_WEEK_MAX = 7;

let keySeq = 0;
export function newSubtask(title: string): SubtaskDraft {
  keySeq += 1;
  return { key: `st-${keySeq}`, title };
}

const BASE: Omit<GoalFormState, "categoryId"> = {
  title: "",
  emoji: null,
  color: null,
  type: "numeric",
  startValue: "",
  targetValue: "",
  unit: "",
  direction: "increase",
  directionTouched: false,
  frequencyType: "per_week",
  timesPerWeek: 3,
  weekdays: [1, 3, 5],
  subtasks: [],
  deadline: "",
  why: "",
  startDate: "",
};

/** Blank form ("Start blank"), optionally with a type/category preselected. */
export function blankForm(
  categories: Category[],
  opts: { type?: GoalType; categoryId?: string } = {},
): GoalFormState {
  const categoryId =
    (opts.categoryId && categories.some((c) => c.id === opts.categoryId) && opts.categoryId) ||
    categories[0]?.id ||
    "";
  return { ...BASE, startDate: todayIso(), categoryId, type: opts.type ?? "numeric" };
}

/** Form prefilled from a template (screen 10 → 11). */
export function formFromTemplate(template: GoalTemplate, categories: Category[]): GoalFormState {
  const base = blankForm(categories, {
    type: template.type,
    categoryId: resolveTemplateCategory(template.category, categories)?.id,
  });
  const state: GoalFormState = { ...base, title: template.name, emoji: template.emoji };
  if (template.numeric) {
    state.startValue = String(template.numeric.start);
    state.targetValue = String(template.numeric.target);
    state.unit = template.numeric.unit;
    state.direction = autoDirection(state.startValue, state.targetValue) ?? "increase";
  }
  if (template.habit) {
    state.frequencyType = template.habit.frequencyType;
    if (template.habit.timesPerWeek) state.timesPerWeek = template.habit.timesPerWeek;
    if (template.habit.weekdays) state.weekdays = [...template.habit.weekdays];
  }
  if (template.milestone) {
    state.subtasks = template.milestone.subtasks.map(newSubtask);
    state.deadline = addDays(todayIso(), template.milestone.dueInDays);
  }
  return state;
}

/** Form filled from an existing goal (screen 11b). */
export function formFromGoal(goal: Goal): GoalFormState {
  return {
    ...BASE,
    title: goal.title,
    emoji: goal.emoji,
    color: goal.color,
    categoryId: goal.category_id,
    type: goal.type,
    startValue: goal.start_value !== null ? String(goal.start_value) : "",
    targetValue: goal.target_value !== null ? String(goal.target_value) : "",
    unit: goal.unit ?? "",
    direction: goal.direction ?? autoDirection(String(goal.start_value ?? 0), String(goal.target_value ?? "")) ?? "increase",
    // Treat the saved direction as "chosen": editing the numbers will still
    // re-derive it because we only keep it if it agrees (see effectiveDirection).
    directionTouched: false,
    frequencyType: goal.frequency_type ?? "per_week",
    // A legacy goal may have frequency_per_week > 7; keep it as is.
    timesPerWeek: goal.frequency_per_week ?? 3,
    weekdays: goal.weekdays?.length ? [...goal.weekdays] : [1, 3, 5],
    subtasks: [],
    deadline: goal.deadline ?? "",
    why: goal.why ?? "",
    startDate: goal.start_date,
  };
}

/** Parse a typed number; "" or junk → null. */
export function parseNum(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** target < start → decrease, target > start → increase, else null. */
export function autoDirection(startRaw: string, targetRaw: string): NumericDirection | null {
  const start = parseNum(startRaw) ?? 0;
  const target = parseNum(targetRaw);
  if (target === null || target === start) return null;
  return target < start ? "decrease" : "increase";
}

/** Direction we'd send: the user's pick if they overrode it, else the auto one. */
export function effectiveDirection(s: GoalFormState): NumericDirection {
  if (s.directionTouched) return s.direction;
  return autoDirection(s.startValue, s.targetValue) ?? s.direction;
}

/** True when the user forced a direction that the numbers contradict (API would 422). */
export function directionMismatch(s: GoalFormState): boolean {
  const auto = autoDirection(s.startValue, s.targetValue);
  return s.directionTouched && auto !== null && auto !== s.direction;
}

export interface ValidateOptions {
  mode: "create" | "edit";
  /** The goal being edited (edit mode). */
  goal?: Goal;
}

/** Field errors, worded as "how to fix it" (components.md "Input"). Empty = valid. */
export function validateGoalForm(s: GoalFormState, opts: ValidateOptions): FormErrors {
  const errors: FormErrors = {};
  const title = s.title.trim();
  const nameMax = Math.max(GOAL_NAME_MAX, opts.goal?.title.length ?? 0);
  if (!title) errors.title = "Give your goal a name.";
  else if (title.length > nameMax) errors.title = `Keep it to ${GOAL_NAME_MAX} characters.`;

  if (!s.categoryId) errors.categoryId = "Pick a category.";

  if (s.type === "numeric") {
    const start = parseNum(s.startValue);
    const target = parseNum(s.targetValue);
    const max = NUMBER_LIMITS.targetValueMaxExclusive;
    if (s.startValue.trim() !== "" && (start === null || start < 0 || start >= max)) {
      errors.startValue = "Use a number from 0 up to 9,999,999,999.";
    }
    if (target === null) {
      errors.targetValue = s.targetValue.trim() === "" ? "Add a target value." : "Use a number, like 80.";
    } else if (target < 0 || target >= max) {
      errors.targetValue = "Use a number from 0 up to 9,999,999,999.";
    } else if (!errors.startValue && target === (start ?? 0)) {
      errors.targetValue = "Start and target can't be the same.";
    }
    if (s.unit.length > TEXT_LIMITS.goalUnit) errors.unit = `Keep the unit to ${TEXT_LIMITS.goalUnit} characters.`;
    if (!errors.startValue && !errors.targetValue && directionMismatch(s)) {
      errors.direction =
        autoDirection(s.startValue, s.targetValue) === "increase"
          ? "Your target is higher than your start, so higher is better. Switch to Increase or change the numbers."
          : "Your target is lower than your start, so lower is better. Switch to Decrease or change the numbers.";
    }
  }

  if (s.type === "habit") {
    if (s.frequencyType === "per_week") {
      const max = Math.max(TIMES_PER_WEEK_MAX, opts.goal?.frequency_per_week ?? 0);
      if (!Number.isInteger(s.timesPerWeek) || s.timesPerWeek < 1 || s.timesPerWeek > max) {
        errors.timesPerWeek = `Pick 1 to ${max} times a week.`;
      }
    }
    if (s.frequencyType === "weekdays" && s.weekdays.length === 0) errors.weekdays = "Pick at least one day.";
  }

  if (s.type === "milestone") {
    // Subtasks are only edited here when creating, or when an edit switches
    // a goal *to* milestone (an existing milestone goal manages them on its page).
    const editsSubtasks = opts.mode === "create" || opts.goal?.type !== "milestone";
    if (editsSubtasks && s.subtasks.filter((t) => t.title.trim()).length === 0) {
      errors.subtasks = "Add at least one subtask.";
    }
    if (!s.deadline) errors.deadline = "Milestone goals need a due date.";
  }

  if (s.why.length > WHY_MAX) errors.why = `Keep it to ${WHY_MAX} characters.`;

  if (!s.startDate) errors.startDate = "Pick a start date.";
  else if (s.deadline && s.startDate > s.deadline) errors.startDate = "Start date can't be after the target date.";

  return errors;
}

/** The type-specific + shared fields, normalised the way the API stores them. */
function goalFields(s: GoalFormState) {
  const fields: GoalUpdateRequest = {
    title: s.title.trim(),
    category_id: s.categoryId,
    emoji: s.emoji,
    color: s.color,
    deadline: s.deadline || null,
    why: s.why.trim() || null,
    start_date: s.startDate,
  };
  if (s.type === "numeric") {
    fields.start_value = parseNum(s.startValue) ?? 0;
    fields.target_value = parseNum(s.targetValue);
    fields.unit = s.unit.trim() || null;
    fields.direction = effectiveDirection(s);
  }
  if (s.type === "habit") {
    fields.frequency_type = s.frequencyType;
    // For daily / weekdays the server works out frequency_per_week itself.
    if (s.frequencyType === "per_week") fields.frequency_per_week = s.timesPerWeek;
    if (s.frequencyType === "weekdays") fields.weekdays = [...s.weekdays].sort((a, b) => a - b);
  }
  return fields;
}

/** POST /goals body. */
export function buildCreatePayload(s: GoalFormState): GoalCreateRequest {
  const fields = goalFields(s);
  const body: GoalCreateRequest = {
    ...fields,
    title: fields.title!,
    category_id: fields.category_id!,
    start_date: fields.start_date!,
    type: s.type,
  };
  if (s.type === "milestone") {
    body.milestones = s.subtasks.map((t) => ({ title: t.title.trim() })).filter((t) => t.title);
  }
  return body;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  return (a ?? null) === (b ?? null);
}

/**
 * PATCH /goals/{id} body: only what changed. If the type changed (allowed
 * while check_in_count is 0) we also send `type` and clear the old type's
 * fields with null so the merged goal validates.
 */
export function buildUpdatePayload(s: GoalFormState, goal: Goal): GoalUpdateRequest {
  const fields = goalFields(s);
  const body: GoalUpdateRequest = {};
  for (const [key, value] of Object.entries(fields) as [keyof GoalUpdateRequest, unknown][]) {
    if (!sameValue(value, goal[key as keyof Goal])) (body as Record<string, unknown>)[key] = value;
  }
  // Switching habit schedule away from "weekdays": the server ignores
  // weekdays for other types, but clear it so the goal doesn't keep stale days.
  if (s.type === "habit" && s.frequencyType !== "weekdays" && goal.weekdays?.length) body.weekdays = null;

  if (s.type !== goal.type) {
    body.type = s.type;
    if (s.type !== "numeric") Object.assign(body, { start_value: null, target_value: null, unit: null, direction: null });
    if (s.type !== "habit") Object.assign(body, { frequency_type: null, weekdays: null });
  }
  return body;
}

/** Has the user changed anything compared with where the form started? */
export function isDirty(current: GoalFormState, initial: GoalFormState): boolean {
  return JSON.stringify(stripKeys(current)) !== JSON.stringify(stripKeys(initial));
}

function stripKeys(s: GoalFormState) {
  return { ...s, subtasks: s.subtasks.map((t) => t.title) };
}
