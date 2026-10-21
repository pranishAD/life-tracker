import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Flame, Plus } from "lucide-react";
import Button from "../components/Button";
import Card from "../components/Card";
import ChartCard from "../components/ChartCard";
import ErrorState from "../components/ErrorState";
import CategoryChip from "../components/CategoryChip";
import GradeBadge from "../components/GradeBadge";
import ScoreRing from "../components/ScoreRing";
import Skeleton from "../components/Skeleton";
import { useCheckInModal } from "../context/CheckInModalContext";
import { useAuth } from "../context/AuthContext";
import { useCategories } from "../hooks/useCategories";
import { useDashboard } from "../hooks/useDashboard";
import { useGoals } from "../hooks/useGoals";
import { resolveTemplateCategory, type TemplateCategoryKey } from "../lib/templates";
import { pointsToNextGrade } from "../lib/dashboardCopy";
import { formatFullDate, todayIso, daysBetween } from "../lib/date";
import { gradeToKey, scoreToGradeKey } from "../lib/grade";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckInModal();
  const [trendDays, setTrendDays] = useState<7 | 30>(7);
  const { data, isLoading, isError, refetch } = useDashboard(trendDays);
  // /dashboard doesn't return a plain "how many active goals" count, only a
  // per-category breakdown — this is the same {status:"active"} query
  // AppShell already runs for the FAB, so it's free (cached) once mounted.
  const { data: activeGoals } = useGoals({ status: "active" });

  return (
    <div>
      <header className="flex justify-between items-end gap-4 mb-5 md:mb-8">
        <div>
          <p className="text-body-sm text-ink-muted mb-1">{formatFullDate(todayIso())}</p>
          <h1 className="text-display-mobile md:text-display">
            {greeting()}, {user?.name.split(" ")[0]}
          </h1>
        </div>
        <div className="hidden md:block">
          <Button icon={<Plus className="w-5 h-5" />} onClick={() => openCheckIn()}>
            Log check-in
          </Button>
        </div>
      </header>

      {isLoading ? (
        <DashboardSkeleton />
      ) : isError ? (
        <Card>
          <ErrorState message="Couldn't load your dashboard." onRetry={() => refetch()} />
        </Card>
      ) : !data ? null : !data.category_scores.some((c) => c.has_active_goals) ? (
        // Truly zero active goals (EC-09) -> full onboarding empty state.
        // Note: overall_score is also null while every goal is still
        // Calibrating (goals <3 days old are excluded from the rollup, same
        // as archived goals) — that's a *different* case, handled below by
        // the normal layout rendering its own Calibrating treatment.
        <EmptyDashboard />
      ) : (
        <>
          <div className="grid gap-4 md:gap-5 md:grid-cols-[1.35fr_1fr]">
            <HeroCard dashboard={data} activeGoalCount={activeGoals?.length ?? null} />
            <div className="flex flex-col gap-4 md:gap-5">
              <CategoriesCard dashboard={data} />
              <StreakCard dashboard={data} />
            </div>
          </div>

          <div className="grid gap-4 md:gap-5 md:grid-cols-[1.35fr_1fr] mt-6 md:mt-8">
            <ChartCard
              title="Score trend"
              grade={gradeToKey(data.overall_grade)}
              data={data.trend}
              currentValue={data.overall_score}
              deltaValue={
                data.overall_score !== null && data.trend.length > 1 && data.trend[0].score !== null
                  ? data.overall_score - data.trend[0].score
                  : null
              }
              deltaCaption={`vs ${trendDays}d ago`}
              rangeOptions={[7, 30]}
              range={trendDays}
              onRangeChange={(r) => setTrendDays(r as 7 | 30)}
              placeholder={data.overall_score === null ? "Your trend line appears after 3 days of check-ins." : undefined}
            />
            <Card>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-heading-md">Needs attention</h2>
                <Link to="/goals" className="text-body-sm text-ink-muted inline-flex items-center gap-1">
                  All goals <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
              {data.attention.length === 0 ? (
                <p className="text-body-sm text-ink-muted">Nothing needs attention right now. Nice.</p>
              ) : (
                <div className="flex flex-col">
                  {data.attention.slice(0, 3).map((item) => {
                    const gradeKey = item.score === null ? "cal" : scoreToGradeKey(item.score);
                    return (
                      <Link
                        key={item.goal_id}
                        to={`/goals/${item.goal_id}`}
                        className="flex items-center gap-3 py-3 border-t border-border first:border-t-0"
                      >
                        <ScoreRing score={item.score} grade={gradeKey} size={48} strokeWidth={5} scoreFontSize={15} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-body truncate">{item.title}</div>
                          <div className="text-body-sm text-ink-muted truncate">{item.reason}</div>
                        </div>
                        <GradeBadge grade={gradeKey} size="sm" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function HeroCard({
  dashboard,
  activeGoalCount,
}: {
  dashboard: NonNullable<ReturnType<typeof useDashboard>["data"]>;
  activeGoalCount: number | null;
}) {
  const gradeKey = gradeToKey(dashboard.overall_grade);
  const score = dashboard.overall_score ?? 0;
  const weekAgoScore = dashboard.trend[0]?.score ?? null;
  const delta = weekAgoScore !== null ? score - weekAgoScore : null;
  const nextGradeCopy = pointsToNextGrade(score, gradeKey);

  return (
    <Card grade={gradeKey} className="relative overflow-hidden rounded-xl">
      <div
        className="absolute w-[420px] h-[420px] -left-[110px] -top-[110px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, var(--g-dim) 0%, transparent 70%)" }}
      />
      <div className="relative flex flex-col md:flex-row items-center gap-5 md:gap-8 text-center md:text-left">
        <ScoreRing
          score={dashboard.overall_score}
          grade={gradeKey}
          size={184}
          strokeWidth={16}
          label="Overall"
          showCaption
          className="md:hidden"
          scoreFontSize={64}
        />
        <ScoreRing
          score={dashboard.overall_score}
          grade={gradeKey}
          size={220}
          strokeWidth={18}
          label="Overall"
          showCaption
          className="hidden md:inline-grid"
          scoreFontSize={88}
        />
        <div className="flex flex-col gap-4 items-center md:items-start">
          <div className="flex items-center gap-4">
            <GradeBadge grade={gradeKey} size="lg" />
            <div>
              <div className="text-label text-ink-muted">This week</div>
              <div className="font-display text-[28px] font-bold" style={{ color: "var(--g)" }}>
                {scoreGradeName(gradeKey)}
              </div>
            </div>
          </div>
          <p className="text-body text-ink-muted max-w-[300px]">
            {delta !== null && (
              <>
                {delta >= 0 ? "Up " : "Down "}
                <span className={delta >= 0 ? "text-grade-a font-semibold" : "text-grade-d font-semibold"}>
                  {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}
                </span>{" "}
                from 7 days ago.{" "}
              </>
            )}
            {nextGradeCopy}
          </p>
          <div className="flex gap-6 flex-wrap justify-center md:justify-start">
            <Stat label="Active goals" value={activeGoalCount !== null ? String(activeGoalCount) : "–"} />
            <Stat label="Current streak" value={`${dashboard.current_streak_days} days`} />
            <Stat label="Best streak" value={`${dashboard.best_streak_days} days`} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-label text-ink-muted mb-0.5">{label}</div>
      <div className="text-stat tabular-nums">{value}</div>
    </div>
  );
}

/** Categories card: the first 4 categories (in the user's order) that have
 * active goals, plus an "All categories" link. Categories with no active
 * goals are hidden (scoring rule EC-10). */
function CategoriesCard({ dashboard }: { dashboard: NonNullable<ReturnType<typeof useDashboard>["data"]> }) {
  const active = dashboard.category_scores.filter((c) => c.has_active_goals);
  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-label text-ink-muted">Categories</h2>
        <Link to="/settings?tab=scoring" className="text-body-sm text-ink-muted inline-flex items-center gap-1">
          Weights <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      {active.length === 0 ? (
        <p className="text-body-sm text-ink-muted">No active goals yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:gap-3">
          {active.slice(0, 4).map((c) => {
            const gradeKey = c.score !== null ? scoreToGradeKey(c.score) : "cal";
            return (
              <div key={c.category.id} className="min-w-0 flex items-center gap-2 md:gap-3 bg-surface-2 rounded-md p-2 md:p-3">
                <ScoreRing score={c.score} grade={gradeKey} size={52} strokeWidth={5} scoreFontSize={16} />
                <div className="min-w-0">
                  <div className="font-semibold text-body-sm md:text-body flex items-center gap-1.5 min-w-0">
                    <span aria-hidden="true" className="font-emoji text-[14px] leading-none flex-none">
                      {c.category.emoji}
                    </span>
                    <span className="truncate">{c.category.name}</span>
                  </div>
                  <div className={`text-label text-grade-${gradeKey}`}>
                    {gradeKey === "cal" ? "Calibrating" : scoreGradeName(gradeKey)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Link
        to="/settings?tab=categories"
        className="mt-3 text-body-sm text-ink-muted inline-flex items-center gap-1 hover:text-ink"
      >
        All categories <ChevronRight className="w-4 h-4" />
      </Link>
    </Card>
  );
}

function scoreGradeName(key: ReturnType<typeof scoreToGradeKey>): string {
  const names: Record<string, string> = {
    s: "Locked In",
    a: "Strong",
    b: "On Track",
    c: "Slipping",
    d: "Off Track",
    cal: "Calibrating",
  };
  return names[key];
}

function StreakCard({ dashboard }: { dashboard: NonNullable<ReturnType<typeof useDashboard>["data"]> }) {
  const today = todayIso();
  const monday = new Date(today);
  const day = monday.getDay();
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const isToday = iso === today;
    // Approximation: a day counts as "logged" if it falls within the
    // trailing streak window ending yesterday (we don't have a per-day
    // check-in feed across all goals from /dashboard, only the streak
    // length) — see handoff note.
    const agoFromToday = daysBetween(iso, today);
    const isOn = !isToday && agoFromToday >= 1 && agoFromToday <= dashboard.current_streak_days;
    return { label: "MTWTFSS"[i], isToday, isOn };
  });

  return (
    <Card>
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-md bg-grade-s-dim text-gold grid place-items-center flex-none">
          <Flame className="w-5 h-5" />
        </div>
        <div>
          <div className="text-label text-ink-muted">Current streak</div>
          <div className="font-display text-[40px] leading-[44px] font-bold tabular-nums">
            {dashboard.current_streak_days} <span className="font-sans text-body font-medium text-ink-muted">days</span>
          </div>
        </div>
      </div>
      <div className="flex gap-1.5 mt-3">
        {days.map((d, i) => (
          <span key={i} className="flex-1 text-center text-label text-ink-muted">
            <i
              className={
                "block h-7 rounded-sm mb-1 " +
                (d.isToday ? "outline outline-[1.5px] outline-dashed outline-border-strong" : d.isOn ? "bg-gold" : "bg-surface-2")
              }
            />
            {d.label}
          </span>
        ))}
      </div>
      <p className="text-body-sm text-ink-muted mt-2">Log one check-in today to keep it going.</p>
    </Card>
  );
}

/** Starter cards on the empty dashboard (02b). Each opens the goal form
 * prefilled: the first two from templates, "Hit a number" as a blank
 * numeric goal in Career. */
const STARTERS: { key: TemplateCategoryKey; title: string; sub: string; to: (categoryId?: string) => string }[] = [
  { key: "fitness", title: "Gym 4x per week", sub: "Habit", to: () => "/goals/new/details?template=gym-4x-week" },
  { key: "study", title: "Finish an assignment", sub: "Milestone with subtasks", to: () => "/goals/new/details?template=finish-assignment" },
  {
    key: "career",
    title: "Hit a number",
    sub: "Numeric, e.g. 10 applications",
    to: (id) => `/goals/new/details?type=numeric${id ? `&category=${id}` : ""}`,
  },
];

function EmptyDashboard() {
  const navigate = useNavigate();
  const { data: categories } = useCategories();
  return (
    <>
      <Card grade="cal">
        <div className="flex flex-col items-center text-center gap-4 py-8 px-2">
          <ScoreRing score={null} grade="cal" size={168} strokeWidth={14} label="Overall" />
          <h2 className="text-heading-lg">Your score starts with your first goal</h2>
          <p className="text-ink-muted max-w-[420px]">
            Add a goal, log check-ins, and Bihan grades you from S to D. Your first grade shows up after 3 days.
          </p>
          <Button icon={<Plus className="w-5 h-5" />} onClick={() => navigate("/goals/new")}>
            Create your first goal
          </Button>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-[720px] mt-4 text-left">
            {STARTERS.map((s) => {
              const category = categories ? resolveTemplateCategory(s.key, categories) : undefined;
              return (
                <Link
                  key={s.title}
                  to={s.to(category?.id)}
                  className="bg-surface-1 border border-border rounded-lg p-4 flex flex-col items-start gap-2 hover:bg-surface-2 hover:border-border-strong transition focus-visible:shadow-focus focus-visible:outline-none"
                >
                  {category && <CategoryChip category={category} />}
                  <b className="text-body font-semibold">{s.title}</b>
                  <span className="text-body-sm text-ink-muted">{s.sub}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </Card>
      <div className="grid gap-4 md:gap-5 md:grid-cols-2 mt-6 md:mt-8">
        <Card>
          <p className="text-label text-ink-muted mb-4">Score trend</p>
          <div className="h-[140px] rounded-md border border-dashed border-border-strong grid place-items-center text-ink-muted text-body-sm text-center px-4">
            Your trend line appears after 3 days of check-ins.
          </div>
        </Card>
        <Card>
          <p className="text-label text-ink-muted mb-4">How grades work</p>
          <div className="flex flex-col gap-3">
            {(["s", "a", "b", "c", "d"] as const).map((g) => (
              <div key={g} className="flex items-center gap-3">
                <GradeBadge grade={g} size="sm" />
                <span className="flex-1 text-body">{scoreGradeName(g)}</span>
                <span className="text-body-sm text-ink-muted tabular-nums">{gradeRangeText(g)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function gradeRangeText(g: "s" | "a" | "b" | "c" | "d"): string {
  return { s: "90-100", a: "75-89", b: "60-74", c: "40-59", d: "0-39" }[g];
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 md:gap-5 md:grid-cols-[1.35fr_1fr]">
      <Skeleton className="h-[280px] md:h-[280px]" />
      <div className="flex flex-col gap-4 md:gap-5">
        <Skeleton className="h-[140px]" />
        <Skeleton className="h-[120px]" />
      </div>
    </div>
  );
}
