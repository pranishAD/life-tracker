// Per-user goal categories (docs/api-contract.yaml, tag "categories").
import { apiFetch } from "./client";
import type { Category, CategoryCreateRequest, CategoryUpdateRequest } from "./types";

/** All of the user's categories, already in display order (sort_order). */
export function listCategories(): Promise<Category[]> {
  return apiFetch<Category[]>("/categories");
}

export function createCategory(body: CategoryCreateRequest): Promise<Category> {
  return apiFetch<Category>("/categories", { method: "POST", body });
}

export function updateCategory(categoryId: string, body: CategoryUpdateRequest): Promise<Category> {
  return apiFetch<Category>(`/categories/${categoryId}`, { method: "PATCH", body });
}

/** `moveTo` is required when the category still has goals (else 409 CATEGORY_HAS_GOALS). */
export function deleteCategory(categoryId: string, moveTo?: string): Promise<void> {
  return apiFetch<void>(`/categories/${categoryId}`, { method: "DELETE", query: { move_to: moveTo } });
}

/** Send every category id, exactly once, in the new order. */
export function reorderCategories(categoryIds: string[]): Promise<Category[]> {
  return apiFetch<Category[]>("/categories/order", { method: "PATCH", body: { category_ids: categoryIds } });
}
