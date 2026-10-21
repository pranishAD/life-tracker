// Goal templates for screen 10 "Pick a start". Frontend-only static data in
// v1 (design/components.md, "Create and edit goals"). A template fills the
// name, emoji, category, type and type fields; milestone templates also add
// starter subtasks. Everything stays editable on the details form.
import type { Category, FrequencyType, GoalType, Weekday } from "../api/types";

/** Which of the 4 seeded default categories a template belongs to. */
export type TemplateCategoryKey = "fitness" | "study" | "career" | "custom";

export interface GoalTemplate {
  slug: string;
  category: TemplateCategoryKey;
  name: string;
  emoji: string;
  type: GoalType;
  /** Card summary under the name, e.g. "Habit · 4 times a week". */
  summary: string;
  numeric?: { start: number; target: number; unit: string };
  habit?: { frequencyType: FrequencyType; timesPerWeek?: number; weekdays?: Weekday[] };
  /** Milestone starter subtasks + a suggested due date (days from today). */
  milestone?: { subtasks: string[]; dueInDays: number };
}

export const TEMPLATE_CATEGORY_ORDER: TemplateCategoryKey[] = ["fitness", "study", "career", "custom"];

/** Default names the backend seeds (contract tag "categories"). */
const DEFAULT_NAMES: Record<TemplateCategoryKey, string> = {
  fitness: "Fitness",
  study: "Study",
  career: "Career",
  custom: "Custom",
};

export const GOAL_TEMPLATES: GoalTemplate[] = [
  // Fitness
  {
    slug: "gym-4x-week",
    category: "fitness",
    name: "Gym 4x a week",
    emoji: "💪",
    type: "habit",
    summary: "Habit · 4 times a week",
    habit: { frequencyType: "per_week", timesPerWeek: 4 },
  },
  {
    slug: "run-5k",
    category: "fitness",
    name: "Run 5 km under 28 min",
    emoji: "🏃",
    type: "numeric",
    summary: "Numeric · 32 → 28 min",
    numeric: { start: 32, target: 28, unit: "min" },
  },
  {
    slug: "bench-press",
    category: "fitness",
    name: "Bench press target",
    emoji: "🏋️",
    type: "numeric",
    summary: "Numeric · 60 → 80 kg",
    numeric: { start: 60, target: 80, unit: "kg" },
  },
  // Study
  {
    slug: "finish-assignment",
    category: "study",
    name: "Finish an assignment",
    emoji: "📝",
    type: "milestone",
    summary: "Milestone · subtasks + due date",
    milestone: {
      subtasks: ["Read the brief", "Research and outline", "Write the first draft", "Edit and add references", "Submit"],
      dueInDays: 14,
    },
  },
  {
    slug: "read-20-pages",
    category: "study",
    name: "Read 20 pages a day",
    emoji: "📖",
    type: "habit",
    summary: "Habit · every day",
    habit: { frequencyType: "daily" },
  },
  {
    slug: "pass-exam",
    category: "study",
    name: "Pass an exam",
    emoji: "🎓",
    type: "milestone",
    summary: "Milestone · topics to revise",
    milestone: {
      subtasks: ["List every topic", "Revise the first half", "Revise the second half", "Do a past paper", "Go over mistakes"],
      dueInDays: 30,
    },
  },
  // Career
  {
    slug: "apply-3-jobs",
    category: "career",
    name: "Apply to 3 jobs a week",
    emoji: "📨",
    type: "habit",
    summary: "Habit · 3 times a week",
    habit: { frequencyType: "per_week", timesPerWeek: 3 },
  },
  {
    slug: "portfolio-site",
    category: "career",
    name: "Ship a portfolio site",
    emoji: "🌐",
    type: "milestone",
    summary: "Milestone · 5 steps",
    milestone: {
      subtasks: ["Pick 3 projects to show", "Sketch the layout", "Build the pages", "Write the case studies", "Deploy and share it"],
      dueInDays: 42,
    },
  },
  {
    slug: "learn-react",
    category: "career",
    name: "Learn React",
    emoji: "⚛️",
    type: "milestone",
    summary: "Milestone · course modules",
    milestone: {
      subtasks: ["Components and props", "State and hooks", "Effects and fetching data", "Routing", "Build a small project"],
      dueInDays: 56,
    },
  },
  // Custom
  {
    slug: "meditate-10",
    category: "custom",
    name: "Meditate 10 min",
    emoji: "🧘",
    type: "habit",
    summary: "Habit · every day",
    habit: { frequencyType: "daily" },
  },
  {
    slug: "bed-by-11",
    category: "custom",
    name: "In bed by 11 pm",
    emoji: "🌙",
    type: "habit",
    summary: "Habit · Sun to Thu",
    habit: { frequencyType: "weekdays", weekdays: [1, 2, 3, 4, 7] },
  },
  {
    slug: "save-50k",
    category: "custom",
    name: "Save Rs 50,000",
    emoji: "🐷",
    type: "numeric",
    summary: "Numeric · 0 → 50,000 Rs",
    numeric: { start: 0, target: 50000, unit: "Rs" },
  },
];

export function findTemplate(slug: string | null | undefined): GoalTemplate | undefined {
  if (!slug) return undefined;
  return GOAL_TEMPLATES.find((t) => t.slug === slug);
}

/**
 * Map a template's category key onto one of *this user's* categories.
 * Defaults can be renamed, so: match the seeded name first, then the default
 * in the same position (Fitness, Study, Career, Custom), then the first
 * category. Returns undefined only if the user has no categories at all.
 */
export function resolveTemplateCategory(
  key: TemplateCategoryKey,
  categories: Category[],
): Category | undefined {
  const byName = categories.find((c) => c.is_default && c.name.toLowerCase() === DEFAULT_NAMES[key].toLowerCase());
  if (byName) return byName;
  const defaults = categories.filter((c) => c.is_default);
  return defaults[TEMPLATE_CATEGORY_ORDER.indexOf(key)] ?? categories[0];
}
