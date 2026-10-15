import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ArrowUpDown, Plus, Target } from "lucide-react";
import Button from "../components/Button";
import Card from "../components/Card";
import ErrorState from "../components/ErrorState";
import GoalCard from "../components/GoalCard";
import GoalFormModal from "../components/GoalFormModal";
import Skeleton from "../components/Skeleton";
import { useGoals } from "../hooks/useGoals";
import { getGoalScore } from "../api/scoring";
import { CATEGORIES, CATEGORY_LABELS } from "../lib/category";
import type { Category, GoalStatus } from "../api/types";

const STATUSES: GoalStatus[] = ["active", "completed", "archived"];

export default function GoalsPage() {
  const [category, setCategory] = useState<Category | "all">("all");
  const [status, setStatus] = useState<GoalStatus>("active");
  const [sortBy, setSortBy] = useState<"score" | "recent">("score");
  const [showCreate, setShowCreate] = useState(false);

  const { data: allGoals } = useGoals({ status });
  const { data: filteredGoals, isLoading, isError, refetch } = useGoals(
    category === "all" ? { status } : { status, category },
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
    const map = new Map<Category, number>();
    for (const g of allGoals ?? []) map.set(g.category, (map.get(g.category) ?? 0) + 1);
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
          <Button icon={<Plus className="w-5 h-5" />} onClick={() => setShowCreate(true)}>
            New goal
          </Button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
        <div className="flex gap-2 overflow-x-auto md:flex-wrap -mr-4 md:mr-0 pb-1 md:pb-0">
          <FilterPill active={category === "all"} onClick={() => setCategory("all")} count={allGoals?.length}>
            All
          </FilterPill>
          {CATEGORIES.map((c) => (
            <FilterPill key={c} active={category === c} onClick={() => setCategory(c)} count={counts.get(c) ?? 0}>
              {CATEGORY_LABELS[c]}
            </FilterPill>
          ))}
        </div>
        <div className="inline-flex bg-surface-1 border border-border rounded-md p-1 self-start">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={
                "px-3.5 py-1.5 rounded-[9px] text-body-sm font-medium capitalize " +
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
            <h2 className="text-heading-lg">No goals yet</h2>
            <p className="text-ink-muted max-w-[420px]">
              Pick something you want to get better at this month. Numeric, habit or milestone, all three
              count toward your score.
            </p>
            <Button icon={<Plus className="w-5 h-5" />} onClick={() => setShowCreate(true)}>
              Create a goal
            </Button>
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
          <Button icon={<Plus className="w-5 h-5" />} onClick={() => setShowCreate(true)}>
            New goal
          </Button>
        )}
      </div>

      {showCreate && <GoalFormModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-body-sm font-medium flex-none " +
        (active ? "bg-ink text-bg border-ink" : "border-border text-ink-muted")
      }
    >
      {children}
      {count !== undefined && <span className="opacity-70">{count}</span>}
    </button>
  );
}
