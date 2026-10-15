// Types hand-typed from docs/api-contract.yaml. Keep this file in sync with
// that file's `components.schemas` section — it is the contract, we don't
// invent fields here.

export type Category = "fitness" | "study" | "career" | "custom";
export type GoalType = "numeric" | "habit" | "milestone";
export type GoalStatus = "active" | "completed" | "archived";
export type Grade = "S" | "A" | "B" | "C" | "D" | "Calibrating";

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
  category: Category;
  type: GoalType;
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
  frequency_per_week: number | null;
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
  category: Category;
  type: GoalType;
  target_value?: number | null;
  unit?: string | null;
  frequency_per_week?: number | null;
  start_date: string;
  deadline?: string | null;
  weight?: number;
}

export interface GoalUpdateRequest {
  title?: string;
  description?: string | null;
  category?: Category;
  target_value?: number | null;
  unit?: string | null;
  frequency_per_week?: number | null;
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

export interface CategoryScore {
  category: Category;
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
  category: Category;
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
