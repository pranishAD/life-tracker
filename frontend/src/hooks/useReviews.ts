import { useQuery } from "@tanstack/react-query";
import { getWeeklyReview } from "../api/reviews";

export function useWeeklyReview(weekStart: string) {
  return useQuery({
    queryKey: ["weeklyReview", weekStart],
    queryFn: () => getWeeklyReview(weekStart),
  });
}
