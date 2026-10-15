import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCategoryWeights, updateCategoryWeights } from "../api/settings";
import type { CategoryWeights } from "../api/types";

export function useCategoryWeights() {
  return useQuery({
    queryKey: ["categoryWeights"],
    queryFn: getCategoryWeights,
  });
}

export function useUpdateCategoryWeights() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CategoryWeights) => updateCategoryWeights(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categoryWeights"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
