// React Query hooks for the user's categories. Every list on screen (goal
// form picker, Goals filters, Settings, dashboard) reads the same
// ["categories"] cache entry, so a rename in Settings shows up everywhere.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/categories";
import type { Category, CategoryCreateRequest, CategoryUpdateRequest } from "../api/types";

export const CATEGORIES_KEY = ["categories"] as const;

/** Max categories per user (contract: 409 CATEGORY_LIMIT_REACHED at 12). */
export const MAX_CATEGORIES = 12;

export function useCategories() {
  return useQuery({ queryKey: CATEGORIES_KEY, queryFn: () => api.listCategories() });
}

/** Anything that shows category names/colours (goals embed a CategoryRef,
 * the dashboard lists categories) must refetch after a category change. */
function invalidateCategoryViews(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
  qc.invalidateQueries({ queryKey: ["goals"] });
  qc.invalidateQueries({ queryKey: ["goal"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  qc.invalidateQueries({ queryKey: ["categoryWeights"] });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CategoryCreateRequest) => api.createCategory(body),
    onSuccess: () => invalidateCategoryViews(qc),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CategoryUpdateRequest }) => api.updateCategory(id, body),
    onSuccess: () => invalidateCategoryViews(qc),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, moveTo }: { id: string; moveTo?: string }) => api.deleteCategory(id, moveTo),
    onSuccess: () => invalidateCategoryViews(qc),
  });
}

/**
 * Reorder with an *optimistic update*: we rewrite the cached list right
 * away so the dragged row stays where it was dropped, then send the PATCH.
 * If the server says no, `onError` puts the old order back.
 */
export function useReorderCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.reorderCategories(ids),
    onMutate: async (ids: string[]) => {
      await qc.cancelQueries({ queryKey: CATEGORIES_KEY });
      const previous = qc.getQueryData<Category[]>(CATEGORIES_KEY);
      if (previous) qc.setQueryData(CATEGORIES_KEY, applyOrder(previous, ids));
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) qc.setQueryData(CATEGORIES_KEY, context.previous);
    },
    onSuccess: (fresh) => qc.setQueryData(CATEGORIES_KEY, fresh),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["categoryWeights"] });
    },
  });
}

/** Return `categories` sorted to match `ids`, with sort_order rewritten 0..n-1. */
export function applyOrder(categories: Category[], ids: string[]): Category[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return ids
    .map((id) => byId.get(id))
    .filter((c): c is Category => !!c)
    .map((c, i) => ({ ...c, sort_order: i }));
}

/** The new id order after dragging `activeId` onto `overId` (the PATCH /categories/order payload). */
export function moveId(ids: string[], activeId: string, overId: string): string[] {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
