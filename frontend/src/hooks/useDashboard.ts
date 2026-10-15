// TanStack Query wraps every server request in a cache keyed by `queryKey`.
// Any component calling `useDashboard(7)` shares one cached result and one
// in-flight request — no manual useState/useEffect/loading-flag juggling.
import { useQuery } from "@tanstack/react-query";
import { getDashboard } from "../api/dashboard";

export function useDashboard(trendDays: 7 | 30 = 7) {
  return useQuery({
    queryKey: ["dashboard", trendDays],
    queryFn: () => getDashboard(trendDays),
  });
}
