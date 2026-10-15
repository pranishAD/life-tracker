import { useQuery } from "@tanstack/react-query";
import { getGoalScore, getGoalScoreHistory } from "../api/scoring";

export function useGoalScore(goalId: string | undefined) {
  return useQuery({
    queryKey: ["goalScore", goalId],
    queryFn: () => getGoalScore(goalId as string),
    enabled: !!goalId,
  });
}

export function useGoalScoreHistory(goalId: string | undefined, days: 7 | 30 = 30) {
  return useQuery({
    queryKey: ["goalScoreHistory", goalId, days],
    queryFn: () => getGoalScoreHistory(goalId as string, days),
    enabled: !!goalId,
  });
}
