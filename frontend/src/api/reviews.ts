import { apiFetch } from "./client";
import type { WeeklyReview } from "./types";

export function getWeeklyReview(weekStart: string): Promise<WeeklyReview> {
  return apiFetch<WeeklyReview>("/reviews/weekly", { query: { week_start: weekStart } });
}
