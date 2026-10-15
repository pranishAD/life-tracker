import { describe, expect, it } from "vitest";
import { expectedProgressPercent, habitProgress, milestoneProgress, numericProgress } from "./progress";
import { todayIso, addDays } from "./date";
import type { Goal } from "../api/types";

function makeGoal(overrides: Partial<Goal>): Goal {
  return {
    id: "g1",
    user_id: "u1",
    title: "Test goal",
    description: null,
    category: "fitness",
    type: "numeric",
    target_value: null,
    current_value: null,
    unit: null,
    frequency_per_week: null,
    start_date: todayIso(),
    deadline: null,
    weight: 1,
    status: "active",
    milestones: [],
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("numericProgress", () => {
  it("computes current / target as a percent", () => {
    const goal = makeGoal({ type: "numeric", current_value: 60, target_value: 80, unit: "kg" });
    const p = numericProgress(goal);
    expect(p.percent).toBe(75);
    expect(p.metaRight).toBe("60 / 80 kg");
  });

  it("caps over-achievement at 100% (EC-06)", () => {
    const goal = makeGoal({ type: "numeric", current_value: 95, target_value: 80 });
    expect(numericProgress(goal).percent).toBe(100);
  });

  it("is 0% with no check-ins yet", () => {
    const goal = makeGoal({ type: "numeric", current_value: 0, target_value: 80 });
    expect(numericProgress(goal).percent).toBe(0);
  });
});

describe("milestoneProgress", () => {
  it("is done/total", () => {
    const goal = makeGoal({
      type: "milestone",
      milestones: [
        { id: "1", goal_id: "g1", title: "a", due_date: null, is_done: true, done_at: null },
        { id: "2", goal_id: "g1", title: "b", due_date: null, is_done: true, done_at: null },
        { id: "3", goal_id: "g1", title: "c", due_date: null, is_done: false, done_at: null },
        { id: "4", goal_id: "g1", title: "d", due_date: null, is_done: false, done_at: null },
      ],
    });
    const p = milestoneProgress(goal);
    expect(p.done).toBe(2);
    expect(p.total).toBe(4);
    expect(p.percent).toBe(50);
  });
});

describe("habitProgress", () => {
  it("is check-ins this week / frequency", () => {
    const goal = makeGoal({ type: "habit", frequency_per_week: 5 });
    expect(habitProgress(goal, 4).percent).toBe(80);
  });

  it("caps at 100% if you've already hit the target", () => {
    const goal = makeGoal({ type: "habit", frequency_per_week: 5 });
    expect(habitProgress(goal, 7).percent).toBe(100);
  });
});

describe("expectedProgressPercent (pace tick)", () => {
  it("is null when the goal has no deadline (EC-01, hides the tick)", () => {
    const goal = makeGoal({ deadline: null });
    expect(expectedProgressPercent(goal)).toBeNull();
  });

  it("is ~50% halfway between start and deadline", () => {
    const goal = makeGoal({
      start_date: addDays(todayIso(), -5),
      deadline: addDays(todayIso(), 5),
    });
    expect(expectedProgressPercent(goal)).toBeCloseTo(50, 0);
  });

  it("is 100% once the deadline has passed", () => {
    const goal = makeGoal({
      start_date: addDays(todayIso(), -20),
      deadline: addDays(todayIso(), -1),
    });
    expect(expectedProgressPercent(goal)).toBe(100);
  });
});
