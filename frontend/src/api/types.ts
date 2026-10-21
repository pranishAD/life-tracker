// Types hand-typed from docs/api-contract.yaml. Keep this file in sync with
// that file's `components.schemas` section — it is the contract, we don't
// invent fields here.

export type GoalType = "numeric" | "habit" | "milestone";
export type GoalStatus = "active" | "completed" | "archived";
export type Grade = "S" | "A" | "B" | "C" | "D" | "Calibrating";

/** The 10 user-pickable identity colours (contract `IdentityColor`). They only
 * tint emoji tiles, category chips, dots and swatches — never grades. */
export type IdentityColor =
  | "slate"
  | "violet"
  | "purple"
  | "pink"
  | "rose"
  | "sand"
  | "lime"
  | "teal"
  | "cyan"
  | "indigo";

export type NumericDirection = "increase" | "decrease";
export type FrequencyType = "daily" | "per_week" | "weekdays";
/** ISO weekday, 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

/** The category fields embedded in a Goal and in dashboard category scores. */
export interface CategoryRef {
  id: string;
  name: string;
  emoji: string;
  color: IdentityColor;
}

/** A user's category (contract `Category`): 4 seeded defaults + custom ones, max 12. */
export interface Category extends CategoryRef {
  sort_order: number;
  is_default: boolean;
  /** Goals in this category, any status (archived included). */
  goal_count: number;
  created_at: string;
}

export interface CategoryCreateRequest {
  name: string;
  emoji: string;
  color: IdentityColor;
}

export interface CategoryUpdateRequest {
  name?: string;
  emoji?: string;
  color?: IdentityColor;
}

export interface CategoryOrderRequest {
  category_ids: string[];
}

export interface Milestone {
  id: string;
  goal_id: string;
  title: string;
  due_date: string | null;
  is_done: boolean;
  done_at: string | null;
}

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category_id: string;
  category: CategoryRef;
  /** null → show the category's emoji */
  emoji: string | null;
  /** null → use the category's colour */
  color: IdentityColor | null;
  type: GoalType;
  start_value: number | null;
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
  direction: NumericDirection | null;
  frequency_type: FrequencyType | null;
  frequency_per_week: number | null;
  weekdays: Weekday[] | null;
  why: string | null;
  /** When > 0 the type is locked on the edit screen. */
  check_in_count: number;
  archived_at: string | null;
  start_date: string;
  deadline: string | null;
  weight: number;
  status: GoalStatus;
  milestones: Milestone[];
  created_at: string;
}

export interface GoalCreateRequest {
  title: string;
  description?: string | null;
  category_id: string;
  emoji?: string | null;
  color?: IdentityColor | null;
  type: GoalType;
  start_value?: number | null;
  target_value?: number | null;
  unit?: string | null;
  direction?: NumericDirection | null;
  frequency_type?: FrequencyType | null;
  frequency_per_week?: number | null;
  weekdays?: Weekday[] | null;
  why?: string | null;
  /** Milestone goals only: starter subtasks, created in this order. */
  milestones?: MilestoneCreateRequest[];
  start_date: string;
  deadline?: string | null;
  weight?: number;
}

/** Partial update. Send null to clear a nullable field. */
export interface GoalUpdateRequest {
  title?: string;
  description?: string | null;
  category_id?: string;
  emoji?: string | null;
  color?: IdentityColor | null;
  type?: GoalType;
  start_value?: number | null;
  target_value?: number | null;
  unit?: string | null;
  direction?: NumericDirection | null;
  frequency_type?: FrequencyType | null;
  frequency_per_week?: number | null;
  weekdays?: Weekday[] | null;
  why?: string | null;
  start_date?: string;
  deadline?: string | null;
  weight?: number;
  status?: GoalStatus;
}

export interface CheckIn {
  id: string;
  goal_id: string;
  value: number | null;
  note: string | null;
  effort_rating: number;
  logged_for: string;
  created_at: string;
}

export interface CheckInCreateRequest {
  value?: number | null;
  note?: string | null;
  effort_rating: number;
  logged_for: string;
}

export interface GoalScore {
  goal_id: string;
  pace: number;
  consistency: number;
  momentum: number;
  effort: number;
  total: number | null;
  grade: Grade;
  is_frozen: boolean;
}

export interface ScoreSnapshot {
  snapshot_date: string;
  pace: number;
  consistency: number;
  momentum: number;
  effort: number;
  total: number | null;
}

/** One per user category, in sort_order (even ones with no goals). */
export interface CategoryScore {
  category: CategoryRef;
  score: number | null;
  has_active_goals: boolean;
}

export interface AttentionGoal {
  goal_id: string;
  title: string;
  score: number | null;
  reason: string;
}

export interface Dashboard {
  overall_score: number | null;
  overall_grade: Grade;
  category_scores: CategoryScore[];
  current_streak_days: number;
  best_streak_days: number;
  trend: { date: string; score: number | null }[];
  attention: AttentionGoal[];
}

export interface WeeklyReviewGoal {
  goal_id: string;
  title: string;
  score: number;
}

export interface WeeklyReview {
  week_start: string;
  has_enough_history: boolean;
  overall_score: number | null;
  previous_week_score: number | null;
  score_change: number | null;
  best_goal: WeeklyReviewGoal | null;
  slipping_goal: WeeklyReviewGoal | null;
}

export interface CategoryWeight {
  category_id: string;
  weight: number;
}

export interface CategoryWeights {
  weights: CategoryWeight[];
}

export interface MilestoneCreateRequest {
  title: string;
  due_date?: string | null;
}

export interface MilestoneUpdateRequest {
  title?: string;
  due_date?: string | null;
  is_done?: boolean;
}

// ---------------------------------------------------------------------------
// Journal (docs/api-contract.yaml, tag "journal"). Journal never affects any
// score, grade or streak.
// ---------------------------------------------------------------------------

/** Mood 1-5: 1 Rough, 2 Low, 3 Okay, 4 Good, 5 Great. */
export type Mood = 1 | 2 | 3 | 4 | 5;

/** A normalised tag: lowercase, no spaces, no "#", 1-32 chars (contract `JournalTag`). */
export type JournalTag = string;

export interface JournalEntry {
  id: string;
  title: string | null;
  body: string;
  mood: Mood | null;
  tags: JournalTag[];
  created_at: string;
  updated_at: string;
}

export interface JournalEntryCreateRequest {
  title?: string | null;
  body: string;
  mood?: Mood | null;
  tags?: JournalTag[];
}

/** Partial update: only sent fields change. `tags` replaces the whole list. */
export interface JournalEntryUpdateRequest {
  title?: string | null;
  body?: string;
  mood?: Mood | null;
  tags?: JournalTag[];
}

export interface JournalEntryPage {
  items: JournalEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface JournalStatsDay {
  date: string;
  entry_count: number;
  avg_mood: number | null;
}

export interface JournalTagCount {
  tag: JournalTag;
  count: number;
}

export interface JournalStats {
  month: string;
  entry_count: number;
  avg_mood: number | null;
  days: JournalStatsDay[];
  total_entries: number;
  tags: JournalTagCount[];
}

export interface JournalListParams {
  q?: string;
  tag?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface JournalExportParams {
  /** Omit for "All time" (backend defaults to the first entry's date). */
  from?: string;
  to?: string;
  include_goals?: boolean;
}

/** The Markdown file plus the summary numbers the backend sends as headers. */
export interface JournalExport {
  markdown: string;
  entryCount: number;
  wordCount: number;
  goalCount: number;
  /** From Content-Disposition, when the header is readable. */
  filename: string | null;
}
