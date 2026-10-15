import { apiFetch } from "./client";
import type { CategoryWeights } from "./types";

export function getCategoryWeights(): Promise<CategoryWeights> {
  return apiFetch<CategoryWeights>("/settings/category-weights");
}

export function updateCategoryWeights(body: CategoryWeights): Promise<CategoryWeights> {
  return apiFetch<CategoryWeights>("/settings/category-weights", { method: "PUT", body });
}
