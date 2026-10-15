import { apiFetch } from "./client";
import type { GoalScore, ScoreSnapshot } from "./types";

export function getGoalScore(goalId: string): Promise<GoalScore> {
  return apiFetch<GoalScore>(`/goals/${goalId}/score`);
}

export function getGoalScoreHistory(goalId: string, days: 7 | 30 = 30): Promise<ScoreSnapshot[]> {
  return apiFetch<ScoreSnapshot[]>(`/goals/${goalId}/score-history`, { query: { days } });
}
