import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { ArrowUpDown, Plus, Target } from "lucide-react";
import Button from "../components/Button";
import Card from "../components/Card";
import ErrorState from "../components/ErrorState";
import GoalCard from "../components/GoalCard";
import CategoryChip from "../components/CategoryChip";
import Skeleton from "../components/Skeleton";
import { useCategories } from "../hooks/useCategories";
import { useGoals } from "../hooks/useGoals";
import { getGoalScore } from "../api/scoring";
import type { GoalStatus } from "../api/types";

const STATUSES: GoalStatus[] = ["active", "completed", "archived"];

export default function GoalsPage() {
  const navigate = useNavigate();
  const newGoal = () => navigate("/goals/new");
  // "all" or a category id. The status filter includes Archived, which is
  // where "Archive" on the edit screen sends a goal.
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<GoalStatus>("active");
  const [sortBy, setSortBy] = useState<"score" | "recent">("score");
  const { data: categories } = useCategories();

  const { data: allGoals } = useGoals({ status });
  const { data: filteredGoals, isLoading, isError, refetch } = useGoals(
    category === "all" ? { status } : { status, category_id: category },
  );

  // Fetched once here (not inside GoalCard) so we can sort the list by
  // score — React Query dedupes this against the same query GoalCard uses,
  // so it's not an extra network request once both are mounted.
  const scoreQueries = useQueries({
    queries: (filteredGoals ?? []).map((g) => ({
      queryKey: ["goalScore", g.id],
      queryFn: () => getGoalScore(g.id),
      enabled: sortBy === "score" && !!filteredGoals,
    })),
  });

  const sortedGoals = useMemo(() => {
    if (!filteredGoals) return [];
    if (sortBy === "recent") {
      return [...filteredGoals].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    const scoreMap = new Map(filteredGoals.map((g, i) => [g.id, scoreQueries[i]?.data?.total ?? -1]));
    return [...filteredGoals].sort((a, b) => (scoreMap.get(b.id) ?? -1) - (scoreMap.get(a.id) ?? -1));
  }, [filteredGoals, sortBy, scoreQueries]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of allGoals ?? []) map.set(g.category_id, (map.get(g.category_id) ?? 0) + 1);
    return map;
  }, [allGoals]);

  return (
    <div>
      <header className="flex justify-between items-end gap-4 mb-5 md:mb-8">
        <div>
          <p className="text-body-sm text-ink-muted mb-1">
            {allGoals ? `${allGoals.length} ${status} goal${allGoals.length === 1 ? "" : "s"}` : "Goals"}
          </p>
          <h1 className="text-display-mobile md:text-display">Goals</h1>
        </div>
        <div className="hidden md:flex gap-2">
          <Button
            variant="secondary"
            icon={<ArrowUpDown className="w-4 h-4" />}
            onClick={() => setSortBy(sortBy === "score" ? "recent" : "score")}
          >
            Sort: {sortBy === "score" ? "Score" : "Recent"}
          </Button>
          <Button icon={<Plus className="w-5 h-5" />} onClick={newGoal}>
            New goal
          </Button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
        <div
          className="flex gap-2 overflow-x-auto md:flex-wrap -mr-4 md:mr-0 pr-4 md:pr-0 pb-1 md:pb-0 [scrollbar-width:none]"
          role="group"
          aria-label="Filter by category"
        >
          <CategoryChip
            category={{ name: "All", emoji: "" }}
            size="lg"
            className="!pl-3"
            selected={category === "all"}
            onClick={() => setCategory("all")}
            suffix={allGoals && allGoals.length > 0 ? <Count n={allGoals.length} /> : undefined}
          />
          {categories?.map((c) => (
            <CategoryChip
              key={c.id}
              category={c}
              size="lg"
              selected={category === c.id}
              onClick={() => setCategory(c.id)}
              suffix={allGoals && allGoals.length > 0 ? <Count n={counts.get(c.id) ?? 0} /> : undefined}
            />
          ))}
        </div>
        <div className="inline-flex bg-surface-1 border border-border rounded-md p-1 self-start" role="group" aria-label="Status">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={
                "px-3.5 py-1.5 rounded-[9px] text-body-sm font-medium capitalize focus-visible:shadow-focus focus-visible:outline-none " +
                (status === s ? "bg-surface-3 text-ink" : "text-ink-muted")
              }
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:gap-5 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[180px]" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <ErrorState message="Couldn't load your goals." onRetry={() => refetch()} />
        </Card>
      ) : sortedGoals.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center text-center gap-4 py-10">
            <div className="w-16 h-16 rounded-lg bg-surface-2 grid place-items-center text-ink-muted">
              <Target className="w-6 h-6" />
            </div>
            <h2 className="text-heading-lg">
              {status === "archived" ? "No archived goals" : status === "completed" ? "No completed goals yet" : "No goals yet"}
            </h2>
            <p className="text-ink-muted max-w-[420px]">
              {status === "archived"
                ? "Goals you archive land here, with their history kept."
                : "Pick something you want to get better at this month. Numeric, habit or milestone, all three count toward your score."}
            </p>
            {status === "active" && (
              <Button icon={<Plus className="w-5 h-5" />} onClick={newGoal}>
                Create a goal
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:gap-5 md:grid-cols-3">
          {sortedGoals.map((g) => (
            <GoalCard key={g.id} goal={g} />
          ))}
        </div>
      )}

      {/* Mobile-only "New goal" lives as a FAB from AppShell; this duplicate
          plain button keeps goal creation reachable even with zero goals,
          where the FAB is intentionally hidden. */}
      <div className="md:hidden fixed right-4 bottom-[88px] z-10">
        {sortedGoals.length === 0 && (
          <Button icon={<Plus className="w-5 h-5" />} onClick={newGoal}>
            New goal
          </Button>
        )}
      </div>
    </div>
  );
}

function Count({ n }: { n: number }) {
  return <span className="opacity-70 tabular-nums">{n}</span>;
}
