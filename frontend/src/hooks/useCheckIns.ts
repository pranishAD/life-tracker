import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as checkInsApi from "../api/checkins";
import type { CheckInCreateRequest } from "../api/types";

export function useCheckIns(goalId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ["checkIns", goalId, limit],
    queryFn: () => checkInsApi.listCheckIns(goalId as string, limit),
    enabled: !!goalId,
  });
}

// Logging a check-in touches a lot of cached data: the goal itself
// (current_value), its score, its score history, the check-in list, the
// dashboard rollup, and the weekly review. We invalidate all of them so the
// UI never shows stale numbers after a save.
export function useCreateCheckIn(goalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CheckInCreateRequest) => checkInsApi.createCheckIn(goalId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checkIns", goalId] });
      qc.invalidateQueries({ queryKey: ["goal", goalId] });
      qc.invalidateQueries({ queryKey: ["goalScore", goalId] });
      qc.invalidateQueries({ queryKey: ["goalScoreHistory", goalId] });
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["weeklyReview"] });
    },
  });
}

export function useDeleteCheckIn(goalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (checkInId: string) => checkInsApi.deleteCheckIn(checkInId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checkIns", goalId] });
      qc.invalidateQueries({ queryKey: ["goal", goalId] });
      qc.invalidateQueries({ queryKey: ["goalScore", goalId] });
      qc.invalidateQueries({ queryKey: ["goalScoreHistory", goalId] });
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
