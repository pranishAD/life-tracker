import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, Trophy, TrendingDown } from "lucide-react";
import Card from "../components/Card";
import ErrorState from "../components/ErrorState";
import GradeBadge from "../components/GradeBadge";
import ScoreRing from "../components/ScoreRing";
import Skeleton from "../components/Skeleton";
import { useWeeklyReview } from "../hooks/useReviews";
import { addDays, formatWeekRange, formatWeekRangeShort, mondayOf } from "../lib/date";
import { scoreToGradeKey } from "../lib/grade";

export default function WeeklyReviewPage() {
  const [weekStart, setWeekStart] = useState(mondayOf());
  const { data, isLoading, isError, refetch } = useWeeklyReview(weekStart);
  const isCurrentWeek = weekStart === mondayOf();

  return (
    <div>
      <header className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-5 md:mb-8">
        <div>
          <p className="text-body-sm text-ink-muted mb-1">{formatWeekRange(weekStart)}</p>
          <h1 className="text-display-mobile md:text-display">Weekly review</h1>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            className="w-9 h-9 rounded-md border border-border-strong grid place-items-center text-ink-muted"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Previous week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="border border-border-strong rounded-md px-3 py-2 text-body-sm font-semibold">
            {formatWeekRangeShort(weekStart)}
          </span>
          <button
            className="w-9 h-9 rounded-md border border-border-strong grid place-items-center text-ink-muted disabled:opacity-40"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            disabled={isCurrentWeek}
            aria-label="Next week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {isLoading ? (
        <Skeleton className="h-[220px]" />
      ) : isError || !data ? (
        <Card>
          <ErrorState message="Couldn't load this week's review." onRetry={() => refetch()} />
        </Card>
      ) : !data.has_enough_history ? (
        <Card>
          <p className="text-ink-muted text-center py-10">First week: no comparison yet.</p>
        </Card>
      ) : (
        <>
          <HeroCompare data={data} weekStart={weekStart} />
          <div className="grid gap-4 md:gap-5 md:grid-cols-2 mt-6 md:mt-8">
            {data.best_goal && (
              <Card grade="s">
                <p className="text-label text-gold flex items-center gap-1.5 mb-4">
                  <Trophy className="w-4 h-4" /> Best goal
                </p>
                <div className="flex gap-5 items-center">
                  <ScoreRing score={data.best_goal.score} grade={scoreToGradeKey(data.best_goal.score)} size={88} strokeWidth={8} scoreFontSize={26} />
                  <div className="min-w-0">
                    <h3 className="text-heading-md">{data.best_goal.title}</h3>
                    <Link to={`/goals/${data.best_goal.goal_id}`} className="text-body-sm text-gold font-semibold">
                      View goal →
                    </Link>
                  </div>
                </div>
              </Card>
            )}
            {data.slipping_goal && (
              <Card grade={scoreToGradeKey(data.slipping_goal.score)}>
                <p className="text-label flex items-center gap-1.5 mb-4" style={{ color: "var(--g)" }}>
                  <TrendingDown className="w-4 h-4" /> Slipping
                </p>
                <div className="flex gap-5 items-center">
                  <ScoreRing
                    score={data.slipping_goal.score}
                    grade={scoreToGradeKey(data.slipping_goal.score)}
                    size={88}
                    strokeWidth={8}
                    scoreFontSize={26}
                  />
                  <div className="min-w-0">
                    <h3 className="text-heading-md">{data.slipping_goal.title}</h3>
                    <Link to={`/goals/${data.slipping_goal.goal_id}`} className="text-body-sm text-gold font-semibold inline-flex items-center gap-1">
                      Plan a session <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </Card>
            )}
          </div>

          <Card className="mt-6 md:mt-8">
            <p className="text-body-sm text-ink-muted">
              Per-category and daily check-in breakdowns for past weeks aren't available from the API yet
              (see handoff note) — this review shows the fields <code>GET /reviews/weekly</code> returns today.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function HeroCompare({ data, weekStart }: { data: NonNullable<ReturnType<typeof useWeeklyReview>["data"]>; weekStart: string }) {
  const score = data.overall_score ?? 0;
  const gradeKey = scoreToGradeKey(score);
  const prevGradeKey = data.previous_week_score !== null ? scoreToGradeKey(data.previous_week_score) : null;
  const isUp = (data.score_change ?? 0) >= 0;
  const gradeChanged = prevGradeKey && prevGradeKey !== gradeKey;

  return (
    <Card grade={gradeKey}>
      <div className="flex flex-col md:flex-row items-center gap-5 md:gap-8 text-center md:text-left">
        {data.previous_week_score !== null && (
          <div className="opacity-55">
            <ScoreRing score={data.previous_week_score} grade={prevGradeKey!} size={112} strokeWidth={10} scoreFontSize={32} />
            <p className="text-label text-ink-muted text-center mt-2">Last week</p>
          </div>
        )}
        {data.previous_week_score !== null && <ArrowRight className="w-5 h-5 text-ink-muted hidden md:block" />}
        <div>
          <ScoreRing score={data.overall_score} grade={gradeKey} size={136} strokeWidth={12} showCaption scoreFontSize={44} className="md:hidden" />
          <ScoreRing score={data.overall_score} grade={gradeKey} size={160} strokeWidth={14} showCaption scoreFontSize={52} className="hidden md:inline-grid" />
          <p className="text-label text-ink-muted text-center mt-2">This week</p>
        </div>
        <div className="flex-1">
          {data.score_change !== null && (
            <div className={"font-display text-[40px] leading-[44px] font-bold " + (isUp ? "text-grade-a" : "text-grade-d")}>
              {isUp ? "▲" : "▼"} {Math.abs(data.score_change)} points
            </div>
          )}
          {gradeChanged && (
            <p className="font-semibold text-body mt-2">
              {prevGradeKey!.toUpperCase()} to {gradeKey.toUpperCase()}. You moved {isUp ? "up" : "down"} a grade.
            </p>
          )}
          <p className="text-ink-muted text-body mt-2 max-w-[420px]">Week of {formatWeekRange(weekStart)}.</p>
        </div>
        <div className="hidden md:block">
          <GradeBadge grade={gradeKey} size="lg" />
        </div>
      </div>
    </Card>
  );
}
