import { apiFetch } from "./client";
import type {
  Goal,
  GoalCreateRequest,
  GoalStatus,
  GoalUpdateRequest,
  Milestone,
  MilestoneCreateRequest,
  MilestoneUpdateRequest,
} from "./types";

export interface GoalFilters {
  category_id?: string;
  status?: GoalStatus;
}

export function listGoals(filters?: GoalFilters): Promise<Goal[]> {
  return apiFetch<Goal[]>("/goals", { query: { category_id: filters?.category_id, status: filters?.status } });
}

export function getGoal(goalId: string): Promise<Goal> {
  return apiFetch<Goal>(`/goals/${goalId}`);
}

export function createGoal(body: GoalCreateRequest): Promise<Goal> {
  return apiFetch<Goal>("/goals", { method: "POST", body });
}

export function updateGoal(goalId: string, body: GoalUpdateRequest): Promise<Goal> {
  return apiFetch<Goal>(`/goals/${goalId}`, { method: "PATCH", body });
}

export function deleteGoal(goalId: string): Promise<void> {
  return apiFetch<void>(`/goals/${goalId}`, { method: "DELETE" });
}

export function addMilestone(goalId: string, body: MilestoneCreateRequest): Promise<Milestone> {
  return apiFetch<Milestone>(`/goals/${goalId}/milestones`, { method: "POST", body });
}

export function updateMilestone(milestoneId: string, body: MilestoneUpdateRequest): Promise<Milestone> {
  return apiFetch<Milestone>(`/milestones/${milestoneId}`, { method: "PATCH", body });
}

export function deleteMilestone(milestoneId: string): Promise<void> {
  return apiFetch<void>(`/milestones/${milestoneId}`, { method: "DELETE" });
}
