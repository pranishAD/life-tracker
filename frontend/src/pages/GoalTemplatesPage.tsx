import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import CategoryChip from "../components/CategoryChip";
import EmojiTile from "../components/EmojiTile";
import ErrorState from "../components/ErrorState";
import FocusedTopBar, { BackButton, StepDots } from "../components/FocusedTopBar";
import Skeleton from "../components/Skeleton";
import { useCategories } from "../hooks/useCategories";
import {
  GOAL_TEMPLATES,
  TEMPLATE_CATEGORY_ORDER,
  resolveTemplateCategory,
  type TemplateCategoryKey,
} from "../lib/templates";

/** Screen 10 "Pick a start" (/goals/new): start blank or from a template. */
export default function GoalTemplatesPage() {
  const navigate = useNavigate();
  const { data: categories, isLoading, isError, refetch } = useCategories();
  const [filter, setFilter] = useState<TemplateCategoryKey | "all">("all");

  // Each template section is shown under *this user's* matching category
  // (defaults may have been renamed or recoloured).
  const sections = useMemo(
    () =>
      TEMPLATE_CATEGORY_ORDER.map((key) => ({
        key,
        category: categories ? resolveTemplateCategory(key, categories) : undefined,
        templates: GOAL_TEMPLATES.filter((t) => t.category === key),
      })).filter((s) => s.category),
    [categories],
  );

  return (
    <div className="min-h-screen bg-bg text-ink">
      <FocusedTopBar
        left={<BackButton onClick={() => navigate("/goals")}>Cancel</BackButton>}
        center={<StepDots step={1} total={2} text="Step 1 of 2 · Pick a start" />}
      />
      <main className="max-w-[960px] mx-auto px-4 pt-5 pb-12 md:px-6 md:pt-8">
        <div className="mb-6">
          <h1 className="text-display-mobile md:text-display">New goal</h1>
          <p className="text-body text-ink-muted mt-1.5">
            Start from a template and tweak it, or start blank. You can change everything later.
          </p>
        </div>

        <Link
          to="/goals/new/details"
          className="flex items-center gap-4 p-4 md:p-5 mb-6 md:mb-8 border-[1.5px] border-dashed border-border-strong rounded-lg hover:bg-surface-1 transition focus-visible:shadow-focus focus-visible:outline-none"
        >
          <span className="w-12 h-12 rounded-md bg-gold text-ink-on-gold grid place-items-center flex-none">
            <Plus className="w-5 h-5" strokeWidth={2} />
          </span>
          <span className="flex-1 min-w-0">
            <b className="block text-heading-md">Start blank</b>
            <span className="text-body-sm text-ink-muted">Name it, pick a type, done in 30 seconds.</span>
          </span>
          <ChevronRight className="w-5 h-5 text-ink-muted flex-none" />
        </Link>

        <p className="text-label uppercase text-ink-muted mb-3">Templates</p>

        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-9 w-80" />
            <Skeleton className="h-[200px]" />
          </div>
        ) : isError ? (
          <ErrorState message="Couldn't load your categories." onRetry={() => refetch()} />
        ) : (
          <>
            <div
              className="flex gap-2 overflow-x-auto md:flex-wrap -mr-4 md:mr-0 pb-1 mb-6 [scrollbar-width:none]"
              role="group"
              aria-label="Filter templates by category"
            >
              <CategoryChip
                category={{ name: "All", emoji: "" }}
                size="lg"
                selected={filter === "all"}
                onClick={() => setFilter("all")}
                className="!pl-3"
              />
              {sections.map((s) => (
                <CategoryChip
                  key={s.key}
                  category={s.category!}
                  size="lg"
                  selected={filter === s.key}
                  onClick={() => setFilter(s.key)}
                />
              ))}
            </div>

            {sections
              .filter((s) => filter === "all" || filter === s.key)
              .map((s) => (
                <section key={s.key} className="mb-6" aria-labelledby={`tpl-${s.key}`}>
                  <h2 id={`tpl-${s.key}`} className="flex items-center gap-2 text-label uppercase text-ink-muted mb-3">
                    <span aria-hidden="true" className="font-emoji text-[14px] normal-case">
                      {s.category!.emoji}
                    </span>
                    {s.category!.name}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-3">
                    {s.templates.map((t) => (
                      <Link
                        key={t.slug}
                        to={`/goals/new/details?template=${t.slug}`}
                        className="flex gap-3 items-center md:items-start px-4 py-3 md:p-4 bg-surface-1 border border-border rounded-lg hover:bg-surface-2 hover:border-border-strong transition focus-visible:shadow-focus focus-visible:outline-none"
                      >
                        <EmojiTile emoji={t.emoji} color={s.category!.color} />
                        <span className="min-w-0 flex-1">
                          <b className="block text-[15px] leading-5 font-semibold">{t.name}</b>
                          <span className="block text-body-sm text-ink-muted mt-0.5">{t.summary}</span>
                        </span>
                        <ChevronRight className="w-4 h-4 text-ink-subtle flex-none md:hidden" />
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
          </>
        )}
      </main>
    </div>
  );
}
