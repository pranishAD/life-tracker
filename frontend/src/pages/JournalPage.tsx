import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileDown, NotebookPen, PenLine } from "lucide-react";
import Button from "../components/Button";
import Card from "../components/Card";
import ErrorState from "../components/ErrorState";
import SearchField from "../components/SearchField";
import Skeleton from "../components/Skeleton";
import TagChip from "../components/TagChip";
import ExportJournalModal from "../components/journal/ExportJournalModal";
import JournalEntryCard from "../components/journal/JournalEntryCard";
import JournalMonthCard from "../components/journal/JournalMonthCard";
import JournalTagsCard from "../components/journal/JournalTagsCard";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useJournalList, useJournalStats } from "../hooks/useJournal";
import { groupEntries } from "../lib/journal";

export const JOURNAL_PROMPTS = [
  "What's on your mind right now?",
  "What went well today?",
  "What got in the way of a goal?",
];

/** Journal list (screen 7) and its empty state (7b). */
export default function JournalPage() {
  const navigate = useNavigate();
  // Search + tag filter live in the URL (?q=&tag=), so they survive a trip
  // into the editor and back, and the browser back button restores them.
  const [searchParams, setSearchParams] = useSearchParams();
  const tag = searchParams.get("tag") ?? "";
  const [searchText, setSearchText] = useState(searchParams.get("q") ?? "");
  const q = useDebouncedValue(searchText.trim(), 250);
  const [showExport, setShowExport] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const stats = useJournalStats();
  const list = useJournalList(q, tag);

  // Copy the debounced search into the URL (replace, so typing doesn't
  // flood the browser history).
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (q) next.set("q", q);
        else next.delete("q");
        return next;
      },
      { replace: true },
    );
  }, [q, setSearchParams]);

  function setTag(value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set("tag", value);
        else next.delete("tag");
        return next;
      },
      { replace: true },
    );
  }

  function clearSearch() {
    setSearchText("");
    setTag("");
  }

  // "/" focuses search (unless you're already typing somewhere or a modal is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || showExport || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showExport]);

  // Infinite scroll: an invisible "sentinel" div sits under the list. When
  // it scrolls into view, IntersectionObserver tells us to load the next page.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  const canObserve = typeof IntersectionObserver !== "undefined";
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !canObserve || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (items) => {
        if (items[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [canObserve, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const entries = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const groups = useMemo(() => groupEntries(entries), [entries]);
  const filtering = q !== "" || tag !== "";
  const isEmptyJournal = stats.data?.total_entries === 0;
  const hasEntries = (stats.data?.total_entries ?? 0) > 0;

  const header = (
    <header className="flex justify-between items-end gap-4 mb-5 md:mb-8">
      <div>
        <p className="text-body-sm text-ink-muted mb-1">
          {stats.data
            ? `${stats.data.entry_count} ${stats.data.entry_count === 1 ? "entry" : "entries"} this month`
            : "Notes and thoughts"}
        </p>
        <h1 className="text-display-mobile md:text-display">Journal</h1>
      </div>
      <div className="hidden md:flex gap-2">
        <Button
          variant="secondary"
          icon={<FileDown className="w-4 h-4" />}
          onClick={() => setShowExport(true)}
          disabled={!hasEntries}
        >
          Export for AI
        </Button>
        <Button icon={<PenLine className="w-5 h-5" />} onClick={() => navigate("/journal/new")}>
          New entry
        </Button>
      </div>
    </header>
  );

  if (stats.isLoading) {
    return (
      <div>
        {header}
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-11" />
            <Skeleton className="h-8 w-2/3" />
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[120px]" />
            ))}
          </div>
          <Skeleton className="hidden md:block h-[260px]" />
        </div>
      </div>
    );
  }

  if (isEmptyJournal) {
    return (
      <div>
        {header}
        <EmptyJournal onWrite={(prompt) => navigate("/journal/new", { state: prompt ? { prompt } : undefined })} />
      </div>
    );
  }

  const tagsInStats = stats.data?.tags ?? [];

  return (
    <div>
      {header}
      <div className="grid gap-6 md:gap-8 md:grid-cols-[minmax(0,1fr)_320px] items-start">
        <div className="min-w-0">
          {/* Tools: search (+ the mobile Export button) and the tag filter row */}
          <div className="flex gap-2">
            <SearchField
              ref={searchRef}
              className="flex-1"
              placeholder="Search entries and tags"
              aria-label="Search entries and tags"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            <button
              type="button"
              className="md:hidden w-11 h-11 flex-none grid place-items-center rounded-md border border-border-strong text-ink disabled:text-ink-subtle disabled:bg-surface-2 focus-visible:shadow-focus focus-visible:outline-none"
              aria-label="Export for AI"
              onClick={() => setShowExport(true)}
              disabled={!hasEntries}
            >
              <FileDown className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-2 mt-3 overflow-x-auto md:flex-wrap -mr-4 md:mr-0 pr-4 md:pr-0 pb-1">
            <TagChip tag="All" hideHash selected={tag === ""} onClick={() => setTag("")} />
            {tagsInStats.map((t) => (
              <TagChip key={t.tag} tag={t.tag} count={t.count} selected={tag === t.tag} onClick={() => setTag(tag === t.tag ? "" : t.tag)} />
            ))}
          </div>

          <div className="mt-5">
            {list.isLoading ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-[120px]" />
                ))}
              </div>
            ) : list.isError ? (
              <Card>
                <ErrorState message="Couldn't load your entries." onRetry={() => list.refetch()} />
              </Card>
            ) : entries.length === 0 ? (
              <Card>
                <div className="flex flex-col items-center text-center gap-3 py-8">
                  <p className="text-body text-ink">
                    {filtering
                      ? q
                        ? `No entries match "${q}"`
                        : `No entries tagged #${tag}`
                      : "No entries yet."}
                  </p>
                  {filtering && (
                    <Button variant="ghost" size="sm" onClick={clearSearch}>
                      Clear search
                    </Button>
                  )}
                </div>
              </Card>
            ) : (
              <>
                {groups.map((group) => (
                  <section key={group.label} className="mb-6 last:mb-0">
                    <h2 className="text-label uppercase text-ink-muted mb-3">{group.label}</h2>
                    <div className="flex flex-col gap-3">
                      {group.entries.map((e) => (
                        <JournalEntryCard key={e.id} entry={e} query={q} />
                      ))}
                    </div>
                  </section>
                ))}
                <div ref={sentinelRef} />
                {isFetchingNextPage && <Skeleton className="h-[120px] mt-3" />}
                {list.isFetchNextPageError && (
                  <ErrorState message="Couldn't load more entries." onRetry={() => fetchNextPage()} />
                )}
                {hasNextPage && !canObserve && !isFetchingNextPage && (
                  <div className="flex justify-center mt-4">
                    <Button variant="secondary" size="sm" onClick={() => fetchNextPage()}>
                      Load more
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right rail on desktop; on mobile the month card drops below the
            list and the Tags card is hidden (the tag row covers it). */}
        <aside className="flex flex-col gap-5 md:sticky md:top-8">
          {stats.isError ? (
            <Card>
              <ErrorState message="Couldn't load journal stats." onRetry={() => stats.refetch()} />
            </Card>
          ) : stats.data ? (
            <>
              <JournalMonthCard stats={stats.data} />
              <div className="hidden md:block">
                <JournalTagsCard tags={tagsInStats} activeTag={tag} onSelect={setTag} />
              </div>
            </>
          ) : null}
        </aside>
      </div>

      {showExport && <ExportJournalModal onClose={() => setShowExport(false)} />}
    </div>
  );
}

/** Screen 7b: no entries at all. */
function EmptyJournal({ onWrite }: { onWrite: (prompt?: string) => void }) {
  return (
    <Card className="md:p-10">
      <div className="flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-lg bg-grade-s-dim text-gold grid place-items-center">
          <NotebookPen className="w-7 h-7" />
        </div>
        <h2 className="text-heading-lg">Your journal is empty</h2>
        <p className="text-ink-muted max-w-[460px]">
          Notes, random thoughts, wins, rants. Write it down here and it sits right next to your goals and scores.
        </p>
        <Button icon={<PenLine className="w-5 h-5" />} onClick={() => onWrite()}>
          Write your first entry
        </Button>
        <p className="text-label uppercase text-ink-muted mt-4">Or start from a prompt</p>
        <div className="grid gap-3 md:grid-cols-3 w-full">
          {JOURNAL_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onWrite(p)}
              className="text-left bg-surface-2 border border-border rounded-md p-4 text-body text-ink hover:border-border-strong hover:bg-surface-3 transition focus-visible:shadow-focus focus-visible:outline-none"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
