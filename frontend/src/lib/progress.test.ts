import { describe, expect, it } from "vitest";
import {
  expectedProgressPercent,
  habitProgress,
  milestoneProgress,
  numericFraction,
  numericProgress,
} from "./progress";
import { todayIso, addDays } from "./date";
import { makeGoal } from "../test/factories";

describe("numericProgress (increase goals)", () => {
  it("runs from start to target: bench 60 → 80 kg at 72 is 60%", () => {
    const goal = makeGoal({ start_value: 60, current_value: 72, target_value: 80, unit: "kg", direction: "increase" });
    const p = numericProgress(goal);
    expect(p.percent).toBeCloseTo(60);
    expect(p.metaRight).toBe("72 / 80 kg");
  });

  it("treats a legacy goal (start 0) as current / target", () => {
    const goal = makeGoal({ start_value: 0, current_value: 60, target_value: 80 });
    expect(numericProgress(goal).percent).toBe(75);
  });

  it("caps over-achievement at 100% (EC-06)", () => {
    const goal = makeGoal({ start_value: 0, current_value: 95, target_value: 80 });
    expect(numericProgress(goal).percent).toBe(100);
  });

  it("is 0% before the first check-in (current = start)", () => {
    const goal = makeGoal({ start_value: 60, current_value: 60, target_value: 80 });
    expect(numericProgress(goal).percent).toBe(0);
  });

  it("is 0% when current is null (falls back to start)", () => {
    const goal = makeGoal({ start_value: 10, current_value: null, target_value: 20 });
    expect(numericProgress(goal).percent).toBe(0);
  });
});

describe("numericProgress (decrease goals)", () => {
  it("5 km 32 → 28 min: 30 min is halfway", () => {
    const goal = makeGoal({ start_value: 32, current_value: 30, target_value: 28, unit: "min", direction: "decrease" });
    const p = numericProgress(goal);
    expect(p.percent).toBe(50);
    expect(p.metaRight).toBe("30 → 28 min");
  });

  it("hitting or beating the target is 100%", () => {
    expect(numericFraction(32, 28, 28)).toBe(1);
    expect(numericFraction(32, 26, 28)).toBe(1);
  });

  it("going the wrong way clamps to 0%, never negative", () => {
    expect(numericFraction(32, 35, 28)).toBe(0);
  });

  it("debt to 0: 50,000 → 0 Rs at 20,000 is 60%", () => {
    expect(numericFraction(50000, 20000, 0)).toBeCloseTo(0.6);
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

describe("habitProgress (expected this week from the schedule)", () => {
  it("per_week: check-ins / N", () => {
    const goal = makeGoal({ type: "habit", frequency_type: "per_week", frequency_per_week: 5 });
    expect(habitProgress(goal, 4).percent).toBe(80);
    expect(habitProgress(goal, 4).metaLeft).toBe("4 of 5 this week");
  });

  it("daily: expects 7", () => {
    const goal = makeGoal({ type: "habit", frequency_type: "daily", frequency_per_week: 7 });
    expect(habitProgress(goal, 7).percent).toBe(100);
    expect(habitProgress(goal, 7).metaLeft).toBe("7 of 7 this week");
  });

  it("weekdays: expects only the picked days", () => {
    const goal = makeGoal({ type: "habit", frequency_type: "weekdays", weekdays: [1, 3, 5], frequency_per_week: 3 });
    expect(habitProgress(goal, 3).percent).toBe(100);
    expect(habitProgress(goal, 3).metaLeft).toBe("3 of 3 this week");
  });

  it("caps at 100% if you've already hit the target", () => {
    const goal = makeGoal({ type: "habit", frequency_type: "per_week", frequency_per_week: 5 });
    expect(habitProgress(goal, 7).percent).toBe(100);
  });
});

describe("expectedProgressPercent (pace tick)", () => {
  it("is null when the goal has no deadline (EC-01, hides the tick)", () => {
    expect(expectedProgressPercent(makeGoal({ deadline: null }))).toBeNull();
  });

  it("is ~50% halfway between start and deadline", () => {
    const goal = makeGoal({ start_date: addDays(todayIso(), -5), deadline: addDays(todayIso(), 5) });
    expect(expectedProgressPercent(goal)).toBeCloseTo(50, 0);
  });

  it("is 100% once the deadline has passed", () => {
    const goal = makeGoal({ start_date: addDays(todayIso(), -20), deadline: addDays(todayIso(), -1) });
    expect(expectedProgressPercent(goal)).toBe(100);
  });

  it("works the same for a decrease goal: fill and tick share one 0→100 scale", () => {
    // 32 → 28 min, halfway through the time window, current 31 = 25% done:
    // the fill (25%) sits left of the tick (50%), i.e. behind pace.
    const goal = makeGoal({
      start_value: 32,
      current_value: 31,
      target_value: 28,
      direction: "decrease",
      start_date: addDays(todayIso(), -5),
      deadline: addDays(todayIso(), 5),
    });
    const tick = expectedProgressPercent(goal)!;
    expect(numericProgress(goal).percent).toBe(25);
    expect(tick).toBeCloseTo(50, 0);
    expect(numericProgress(goal).percent).toBeLessThan(tick);
  });
});
