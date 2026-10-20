import { describe, expect, it } from "vitest";
import {
  autoDirection,
  blankForm,
  buildCreatePayload,
  buildUpdatePayload,
  directionMismatch,
  formFromGoal,
  formFromTemplate,
  newSubtask,
  validateGoalForm,
  type GoalFormState,
} from "./goalForm";
import { findTemplate, GOAL_TEMPLATES, resolveTemplateCategory } from "./templates";
import { addDays, todayIso } from "./date";
import { DEFAULT_CATEGORIES, makeCategory, makeGoal } from "../test/factories";

const cats = DEFAULT_CATEGORIES;
const valid = (s: GoalFormState) => validateGoalForm(s, { mode: "create" });

describe("templates", () => {
  it("has the 12 templates from components.md, 3 per default category", () => {
    expect(GOAL_TEMPLATES).toHaveLength(12);
    for (const key of ["fitness", "study", "career", "custom"]) {
      expect(GOAL_TEMPLATES.filter((t) => t.category === key)).toHaveLength(3);
    }
    expect(GOAL_TEMPLATES.map((t) => t.name)).toEqual([
      "Gym 4x a week",
      "Run 5 km under 28 min",
      "Bench press target",
      "Finish an assignment",
      "Read 20 pages a day",
      "Pass an exam",
      "Apply to 3 jobs a week",
      "Ship a portfolio site",
      "Learn React",
      "Meditate 10 min",
      "In bed by 11 pm",
      "Save Rs 50,000",
    ]);
  });

  it("every template prefills a form that passes validation", () => {
    for (const t of GOAL_TEMPLATES) {
      expect(valid(formFromTemplate(t, cats)), t.slug).toEqual({});
    }
  });

  it("maps a template onto the user's default category even after a rename", () => {
    const renamed = cats.map((c) => (c.id === "cat-study" ? { ...c, name: "Uni" } : c));
    expect(resolveTemplateCategory("study", renamed)?.id).toBe("cat-study");
    expect(resolveTemplateCategory("fitness", renamed)?.id).toBe("cat-fit");
  });

  it("falls back to the first category if no defaults exist", () => {
    const custom = [makeCategory({ id: "only" })];
    expect(resolveTemplateCategory("career", custom)?.id).toBe("only");
  });
});

describe("template → form prefill", () => {
  it("numeric: Run 5 km fills name, emoji, category, 32 → 28 min and Decrease", () => {
    const f = formFromTemplate(findTemplate("run-5k")!, cats);
    expect(f).toMatchObject({
      title: "Run 5 km under 28 min",
      emoji: "🏃",
      color: null, // never picked → the category's colour
      categoryId: "cat-fit",
      type: "numeric",
      startValue: "32",
      targetValue: "28",
      unit: "min",
      direction: "decrease",
      startDate: todayIso(),
    });
  });

  it("habit per week: Gym 4x a week", () => {
    const f = formFromTemplate(findTemplate("gym-4x-week")!, cats);
    expect(f).toMatchObject({ type: "habit", frequencyType: "per_week", timesPerWeek: 4, categoryId: "cat-fit" });
  });

  it("habit weekdays: In bed by 11 pm is Sun to Thu", () => {
    const f = formFromTemplate(findTemplate("bed-by-11")!, cats);
    expect(f).toMatchObject({ type: "habit", frequencyType: "weekdays", weekdays: [1, 2, 3, 4, 7], categoryId: "cat-custom" });
  });

  it("milestone: starter subtasks and a due date", () => {
    const f = formFromTemplate(findTemplate("finish-assignment")!, cats);
    expect(f.type).toBe("milestone");
    expect(f.subtasks.map((s) => s.title)).toEqual([
      "Read the brief",
      "Research and outline",
      "Write the first draft",
      "Edit and add references",
      "Submit",
    ]);
    expect(f.deadline).toBe(addDays(todayIso(), 14));
    expect(f.categoryId).toBe("cat-study");
  });
});

describe("numeric direction", () => {
  it("is set automatically from start vs target", () => {
    expect(autoDirection("32", "28")).toBe("decrease");
    expect(autoDirection("60", "80")).toBe("increase");
    expect(autoDirection("", "80")).toBe("increase"); // start defaults to 0
    expect(autoDirection("5", "5")).toBeNull();
  });

  it("an override that agrees with the numbers is fine", () => {
    const f = { ...blankForm(cats), title: "Bench", targetValue: "80", startValue: "60", direction: "increase" as const, directionTouched: true };
    expect(directionMismatch(f)).toBe(false);
    expect(valid(f)).toEqual({});
  });

  it("an override that disagrees shows an inline error instead of sending", () => {
    const f = { ...blankForm(cats), title: "5k", startValue: "32", targetValue: "28", direction: "increase" as const, directionTouched: true };
    expect(directionMismatch(f)).toBe(true);
    expect(valid(f).direction).toMatch(/lower than your start/);
  });

  it("requires a target and start ≠ target", () => {
    const base = { ...blankForm(cats), title: "x" };
    expect(valid(base).targetValue).toBe("Add a target value.");
    expect(valid({ ...base, startValue: "5", targetValue: "5" }).targetValue).toBe("Start and target can't be the same.");
    expect(valid({ ...base, targetValue: "-3" }).targetValue).toMatch(/from 0/);
  });

  it("create payload sends start, target, unit and the derived direction", () => {
    const f = formFromTemplate(findTemplate("run-5k")!, cats);
    expect(buildCreatePayload(f)).toEqual({
      title: "Run 5 km under 28 min",
      category_id: "cat-fit",
      emoji: "🏃",
      color: null,
      type: "numeric",
      start_value: 32,
      target_value: 28,
      unit: "min",
      direction: "decrease",
      deadline: null,
      why: null,
      start_date: todayIso(),
    });
  });

  it("allows a decrease goal down to 0 (debt to 0)", () => {
    const f = { ...blankForm(cats), title: "Debt", startValue: "50000", targetValue: "0" };
    expect(valid(f)).toEqual({});
    expect(buildCreatePayload(f)).toMatchObject({ start_value: 50000, target_value: 0, direction: "decrease" });
  });
});

describe("habit frequency payloads", () => {
  const habit = (patch: Partial<GoalFormState>) => ({ ...blankForm(cats, { type: "habit" }), title: "Habit", ...patch });

  it("daily: sends frequency_type only (server sets 7 a week)", () => {
    const body = buildCreatePayload(habit({ frequencyType: "daily" }));
    expect(body.frequency_type).toBe("daily");
    expect(body).not.toHaveProperty("frequency_per_week");
    expect(body).not.toHaveProperty("weekdays");
    expect(body).not.toHaveProperty("start_value");
  });

  it("per_week: sends frequency_per_week", () => {
    const body = buildCreatePayload(habit({ frequencyType: "per_week", timesPerWeek: 5 }));
    expect(body).toMatchObject({ type: "habit", frequency_type: "per_week", frequency_per_week: 5 });
    expect(body).not.toHaveProperty("weekdays");
  });

  it("weekdays: sends the picked days sorted, no frequency_per_week", () => {
    const body = buildCreatePayload(habit({ frequencyType: "weekdays", weekdays: [6, 1, 4] }));
    expect(body).toMatchObject({ frequency_type: "weekdays", weekdays: [1, 4, 6] });
    expect(body).not.toHaveProperty("frequency_per_week");
  });

  it("stepper range is 1-7, but a legacy goal with 10 a week stays valid", () => {
    expect(validateGoalForm(habit({ timesPerWeek: 8 }), { mode: "create" }).timesPerWeek).toBe("Pick 1 to 7 times a week.");
    const legacy = makeGoal({ type: "habit", frequency_type: "per_week", frequency_per_week: 10 });
    const f = formFromGoal(legacy);
    expect(f.timesPerWeek).toBe(10);
    expect(validateGoalForm(f, { mode: "edit", goal: legacy })).toEqual({});
    // and it isn't silently changed: nothing to send
    expect(buildUpdatePayload(f, legacy)).toEqual({});
  });
});

describe("milestone payload", () => {
  it("sends starter subtasks in order as `milestones`, skipping blanks", () => {
    const f: GoalFormState = {
      ...blankForm(cats, { type: "milestone" }),
      title: "Ship it",
      deadline: addDays(todayIso(), 10),
      subtasks: [newSubtask("Design"), newSubtask("  "), newSubtask("Build "), newSubtask("Launch")],
    };
    const body = buildCreatePayload(f);
    expect(body.milestones).toEqual([{ title: "Design" }, { title: "Build" }, { title: "Launch" }]);
    expect(body.deadline).toBe(addDays(todayIso(), 10));
  });

  it("needs at least one subtask and a due date", () => {
    const errors = valid({ ...blankForm(cats, { type: "milestone" }), title: "x" });
    expect(errors.subtasks).toBe("Add at least one subtask.");
    expect(errors.deadline).toBe("Milestone goals need a due date.");
  });
});

describe("other validation", () => {
  it("name is required and ≤ 60", () => {
    const f = { ...blankForm(cats), targetValue: "1" };
    expect(valid(f).title).toBe("Give your goal a name.");
    expect(valid({ ...f, title: "x".repeat(61) }).title).toMatch(/60 characters/);
  });

  it("why ≤ 140 and start date not after the target date", () => {
    const f = { ...blankForm(cats), title: "x", targetValue: "1", why: "y".repeat(141), deadline: addDays(todayIso(), -1) };
    const e = valid(f);
    expect(e.why).toMatch(/140/);
    expect(e.startDate).toBe("Start date can't be after the target date.");
  });

  it("why is trimmed, empty → null", () => {
    expect(buildCreatePayload({ ...blankForm(cats), title: "x", targetValue: "1", why: "   " }).why).toBeNull();
  });
});

describe("edit payload", () => {
  const goal = makeGoal({
    type: "habit",
    title: "Gym",
    frequency_type: "per_week",
    frequency_per_week: 4,
    check_in_count: 3,
    start_date: "2026-10-01",
  });

  it("only sends what changed", () => {
    const f = { ...formFromGoal(goal), why: "Play futsal again", frequencyType: "weekdays" as const, weekdays: [1, 2, 4] as GoalFormState["weekdays"] };
    expect(buildUpdatePayload(f, goal)).toEqual({ why: "Play futsal again", frequency_type: "weekdays", weekdays: [1, 2, 4] });
  });

  it("never sends `type` when it didn't change", () => {
    const f = { ...formFromGoal(goal), title: "Gym 5 days" };
    expect(buildUpdatePayload(f, goal)).toEqual({ title: "Gym 5 days" });
  });

  it("switching type (no check-ins yet) sends type and clears the old type's fields", () => {
    const fresh = makeGoal({ type: "numeric", start_value: 0, target_value: 10, direction: "increase", check_in_count: 0 });
    const f = { ...formFromGoal(fresh), type: "habit" as const, frequencyType: "daily" as const };
    expect(buildUpdatePayload(f, fresh)).toMatchObject({
      type: "habit",
      frequency_type: "daily",
      start_value: null,
      target_value: null,
      direction: null,
    });
  });

  it("emoji/colour back to the category's = null", () => {
    const g = makeGoal({ type: "numeric", start_value: 0, target_value: 5, direction: "increase", emoji: "🔥", color: "rose" });
    const f = { ...formFromGoal(g), emoji: null, color: null };
    expect(buildUpdatePayload(f, g)).toEqual({ emoji: null, color: null });
  });
});
