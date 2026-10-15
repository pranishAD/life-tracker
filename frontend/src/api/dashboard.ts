import { apiFetch } from "./client";
import type { Dashboard } from "./types";

export function getDashboard(trendDays: 7 | 30 = 7): Promise<Dashboard> {
  return apiFetch<Dashboard>("/dashboard", { query: { trend_days: trendDays } });
}
