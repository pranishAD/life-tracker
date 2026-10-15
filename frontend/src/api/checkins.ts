import { apiFetch } from "./client";
import type { CheckIn, CheckInCreateRequest } from "./types";

export function listCheckIns(goalId: string, limit = 50): Promise<CheckIn[]> {
  return apiFetch<CheckIn[]>(`/goals/${goalId}/check-ins`, { query: { limit } });
}

export function createCheckIn(goalId: string, body: CheckInCreateRequest): Promise<CheckIn> {
  return apiFetch<CheckIn>(`/goals/${goalId}/check-ins`, { method: "POST", body });
}

export function deleteCheckIn(checkInId: string): Promise<void> {
  return apiFetch<void>(`/check-ins/${checkInId}`, { method: "DELETE" });
}
