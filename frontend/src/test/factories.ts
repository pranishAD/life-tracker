// Test data builders that follow docs/api-contract.yaml shapes. Override only
// the fields a test cares about.
import type { Category, Goal } from "../api/types";
import { todayIso } from "../lib/date";

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat-fit", name: "Fitness", emoji: "🏃", color: "teal", sort_order: 0, is_default: true, goal_count: 2, created_at: "2026-01-01T00:00:00Z" },
  { id: "cat-study", name: "Study", emoji: "📚", color: "violet", sort_order: 1, is_default: true, goal_count: 0, created_at: "2026-01-01T00:00:00Z" },
  { id: "cat-career", name: "Career", emoji: "💼", color: "indigo", sort_order: 2, is_default: true, goal_count: 1, created_at: "2026-01-01T00:00:00Z" },
  { id: "cat-custom", name: "Custom", emoji: "✨", color: "slate", sort_order: 3, is_default: true, goal_count: 0, created_at: "2026-01-01T00:00:00Z" },
];

export function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-side",
    name: "Side projects",
    emoji: "🚀",
    color: "pink",
    sort_order: 4,
    is_default: false,
    goal_count: 0,
    created_at: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

export function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    user_id: "u1",
    title: "Test goal",
    description: null,
    category_id: "cat-fit",
    category: { id: "cat-fit", name: "Fitness", emoji: "🏃", color: "teal" },
    emoji: null,
    color: null,
    type: "numeric",
    start_value: null,
    target_value: null,
    current_value: null,
    unit: null,
    direction: null,
    frequency_type: null,
    frequency_per_week: null,
    weekdays: null,
    why: null,
    check_in_count: 0,
    archived_at: null,
    start_date: todayIso(),
    deadline: null,
    weight: 1,
    status: "active",
    milestones: [],
    created_at: new Date().toISOString(),
    ...overrides,
  };
}
