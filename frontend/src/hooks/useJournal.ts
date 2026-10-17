import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as journalApi from "../api/journal";
import type { JournalExportParams } from "../api/types";

// Query keys: React Query caches each request under a "key" (an array).
// Every journal key starts with "journal", so one
// `invalidateQueries({ queryKey: ["journal"] })` refreshes all journal data
// (list, stats, entries, export preview) at once.
//
// Journal never changes a score, so journal mutations deliberately do NOT
// invalidate ["dashboard"], ["goalScore"], etc.
export const journalKeys = {
  all: ["journal"] as const,
  list: (q: string, tag: string) => ["journal", "list", { q, tag }] as const,
  stats: (month?: string) => ["journal", "stats", month ?? "current"] as const,
  entry: (id: string) => ["journal", "entry", id] as const,
  export: (params: JournalExportParams) => ["journal", "export", params] as const,
};

export const JOURNAL_PAGE_SIZE = 20;

/**
 * Infinite list for the Journal page. `useInfiniteQuery` keeps an array of
 * pages; `fetchNextPage()` asks for the next one using `getNextPageParam`,
 * which here is just the next offset. Returning `undefined` tells React
 * Query there are no more pages (`hasNextPage` becomes false).
 */
export function useJournalList(q: string, tag: string) {
  return useInfiniteQuery({
    queryKey: journalKeys.list(q, tag),
    queryFn: ({ pageParam }) =>
      journalApi.listJournalEntries({ q, tag, limit: JOURNAL_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.offset + last.limit;
      return next >= last.total ? undefined : next;
    },
  });
}

export function useJournalStats(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: journalKeys.stats(),
    queryFn: () => journalApi.getJournalStats(),
    enabled: options.enabled ?? true,
  });
}

export function useJournalEntry(entryId: string | undefined) {
  return useQuery({
    queryKey: journalKeys.entry(entryId ?? ""),
    queryFn: () => journalApi.getJournalEntry(entryId as string),
    enabled: !!entryId,
    // The editor owns this entry while it's open; don't refetch under it.
    staleTime: Infinity,
  });
}

/**
 * The export preview. `placeholderData: keepPreviousData` keeps showing the
 * last preview while the new one loads, so the box doesn't flash empty each
 * time you change the range. `isPlaceholderData` tells us it's the old one.
 */
export function useJournalExport(params: JournalExportParams | null) {
  return useQuery({
    queryKey: journalKeys.export(params ?? {}),
    queryFn: () => journalApi.exportJournal(params as JournalExportParams),
    enabled: params !== null,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
}

export function useDeleteJournalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => journalApi.deleteJournalEntry(entryId),
    onSuccess: (_data, entryId) => {
      qc.removeQueries({ queryKey: journalKeys.entry(entryId) });
      qc.invalidateQueries({ queryKey: journalKeys.all });
    },
  });
}
