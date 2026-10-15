// The Goal object from the API doesn't carry "check-ins so far this week" or
// "current streak" — those need the check-in history. This hook computes
// them client-side for habit goals only (numeric/milestone goals already
// have everything they need on the Goal object itself).
import { useMemo } from "react";
import { useCheckIns } from "./useCheckIns";
import type { Goal } from "../api/types";
import { mondayOf, todayIso, addDays } from "../lib/date";

export interface HabitExtras {
  checkInsThisWeek: number;
  streakDays: number;
  isLoading: boolean;
}

export function useHabitExtras(goal: Goal): HabitExtras {
  const isHabit = goal.type === "habit";
  const { data: checkIns, isLoading } = useCheckIns(isHabit ? goal.id : undefined, 200);

  return useMemo(() => {
    if (!isHabit || !checkIns) return { checkInsThisWeek: 0, streakDays: 0, isLoading };

    const monday = mondayOf();
    const checkInsThisWeek = new Set(
      checkIns.filter((c) => c.logged_for >= monday).map((c) => c.logged_for),
    ).size;

    // Streak = consecutive days with a check-in, walking back from today.
    // Today itself is allowed to be "missing" without breaking the streak
    // (the user just hasn't logged yet today).
    const loggedDays = new Set(checkIns.map((c) => c.logged_for));
    let streakDays = 0;
    let cursor = todayIso();
    if (!loggedDays.has(cursor)) cursor = addDays(cursor, -1);
    while (loggedDays.has(cursor)) {
      streakDays += 1;
      cursor = addDays(cursor, -1);
    }

    return { checkInsThisWeek, streakDays, isLoading };
  }, [isHabit, checkIns, isLoading]);
}
