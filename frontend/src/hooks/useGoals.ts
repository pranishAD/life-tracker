import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as goalsApi from "../api/goals";
import type {
  Category,
  GoalCreateRequest,
  GoalStatus,
  GoalUpdateRequest,
  MilestoneCreateRequest,
  MilestoneUpdateRequest,
} from "../api/types";

export function useGoals(filters?: { category?: Category; status?: GoalStatus }) {
  return useQuery({
    queryKey: ["goals", filters],
    queryFn: () => goalsApi.listGoals(filters),
  });
}

export function useGoal(goalId: string | undefined) {
  return useQuery({
    queryKey: ["goal", goalId],
    queryFn: () => goalsApi.getGoal(goalId as string),
    enabled: !!goalId,
  });
}

// A mutation is React Query's wrapper for POST/PATCH/DELETE: it tracks
// isPending/isError for the button, and `onSuccess` is where we tell the
// cache "this data is stale, go refetch" via `invalidateQueries`.
export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GoalCreateRequest) => goalsApi.createGoal(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateGoal(goalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GoalUpdateRequest) => goalsApi.updateGoal(goalId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goal", goalId] });
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) => goalsApi.deleteGoal(goalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useAddMilestone(goalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MilestoneCreateRequest) => goalsApi.addMilestone(goalId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goal", goalId] });
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}

export function useUpdateMilestone(goalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, body }: { milestoneId: string; body: MilestoneUpdateRequest }) =>
      goalsApi.updateMilestone(milestoneId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goal", goalId] });
      qc.invalidateQueries({ queryKey: ["goalScore", goalId] });
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
