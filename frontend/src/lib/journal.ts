// Pure helpers for the Journal screens. No React in here on purpose: plain
// functions are easy to unit-test (see journal.test.ts) and reuse.
import type { JournalEntry } from "../api/types";
import { addDays, mondayOf, parseIso, toIso, todayIso } from "./date";

// ---------------------------------------------------------------------------
// Mood
// ---------------------------------------------------------------------------

export const MOOD_LABELS = ["Rough", "Low", "Okay", "Good", "Great"] as const;

/** 1 → "Rough" … 5 → "Great". */
export function moodLabel(mood: number): string {
  return MOOD_LABELS[Math.min(5, Math.max(1, Math.round(mood))) - 1];
}

// ---------------------------------------------------------------------------
// Tags (rules copied from the contract's `JournalTag` schema)
// ---------------------------------------------------------------------------

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 32;
const VALID_TAG = /^[\p{L}\p{M}\p{N}_-]+$/u;

/**
 * Normalise one tag the same way the backend does on save: trim, drop the
 * leading "#", lowercase, whitespace runs become "-". Returns `null` when the
 * result isn't a valid tag (empty, too long, or has other characters), so we
 * never send something the API would reject with a 422.
 */
export function normalizeTag(raw: string): string | null {
  const tag = raw.trim().replace(/^#+/, "").trim().toLowerCase().replace(/\s+/g, "-");
  if (!tag || tag.length > MAX_TAG_LENGTH || !VALID_TAG.test(tag)) return null;
  return tag;
}

/**
 * Add whatever the user typed (may contain commas, e.g. a paste of
 * "gym, legs") to the current list. Skips duplicates and invalid tags and
 * stops at MAX_TAGS. `rejected` lets the UI explain why something didn't stick.
 */
export function addTags(current: string[], raw: string): { tags: string[]; rejected: string[] } {
  const tags = [...current];
  const rejected: string[] = [];
  for (const part of raw.split(",")) {
    if (!part.trim()) continue;
    const tag = normalizeTag(part);
    if (!tag) {
      rejected.push(part.trim());
      continue;
    }
    if (tags.includes(tag)) continue;
    if (tags.length >= MAX_TAGS) {
      rejected.push(part.trim());
      continue;
    }
    tags.push(tag);
  }
  return { tags, rejected };
}

/** The user's most-used tags (stats order) that aren't on this entry yet. */
export function suggestedTags(allTags: { tag: string }[], current: string[], max = 4): string[] {
  return allTags.map((t) => t.tag).filter((t) => !current.includes(t)).slice(0, max);
}

// ---------------------------------------------------------------------------
// Entry card text
// ---------------------------------------------------------------------------

/**
 * What an entry card shows. Titled entries: title + body as the excerpt.
 * Untitled entries (design rule): the body's first sentence becomes the
 * title and the rest of the body is the excerpt.
 */
export function entryDisplay(entry: Pick<JournalEntry, "title" | "body">): {
  title: string;
  excerpt: string;
  untitled: boolean;
} {
  const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
  const title = entry.title?.trim();
  if (title) return { title, excerpt: collapse(entry.body), untitled: false };

  const text = entry.body.trim();
  const firstLine = text.split("\n")[0];
  // A sentence ends at . ! ? or … followed by a space (or the end of the line).
  const match = /^(.*?[.!?…])(?=\s|$)/.exec(firstLine);
  const sentence = (match ? match[1] : firstLine).trim();
  return { title: sentence, excerpt: collapse(text.slice(sentence.length)), untitled: true };
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-10" → "October". */
export function monthName(yyyyMm: string): string {
  const m = Number(yyyyMm.split("-")[1]);
  return MONTH_NAMES[m - 1] ?? yyyyMm;
}

export interface EntryGroup<T> {
  label: string;
  entries: T[];
}

/**
 * Group entries (already newest first from the API) into "This week",
 * "Last week", then one group per month ("September 2026"). Weeks start on
 * Monday, matching the weekly review. Dates are the user's local time.
 */
export function groupEntries<T extends { created_at: string }>(entries: T[], now: Date = new Date()): EntryGroup<T>[] {
  const thisMonday = mondayOf(toIso(now));
  const lastMonday = addDays(thisMonday, -7);
  const groups = new Map<string, T[]>();

  for (const entry of entries) {
    const created = new Date(entry.created_at);
    const day = toIso(created);
    const label =
      day >= thisMonday
        ? "This week"
        : day >= lastMonday
          ? "Last week"
          : `${MONTH_NAMES[created.getMonth()]} ${created.getFullYear()}`;
    const list = groups.get(label);
    if (list) list.push(entry);
    else groups.set(label, [entry]);
  }

  return Array.from(groups, ([label, list]) => ({ label, entries: list }));
}

/** "Sat, Oct 17 · 4:58 PM" — the editor's date line. */
export function formatEntryDateTime(date: Date): string {
  const day = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${day} · ${formatTime(date)}`;
}

/** "4:58 PM" */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Export for AI
// ---------------------------------------------------------------------------

export type ExportPreset = "7d" | "30d" | "month" | "all";

export const EXPORT_PRESETS: { id: ExportPreset; label: string }[] = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
];

/** Dates for a preset. "All time" has no `from` (the API then starts at the first entry). */
export function presetRange(preset: ExportPreset, today: string = todayIso()): { from: string; to: string } {
  switch (preset) {
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "month": {
      const d = parseIso(today);
      return { from: toIso(new Date(d.getFullYear(), d.getMonth(), 1)), to: today };
    }
    case "all":
      return { from: "", to: today };
  }
}

/** `bihan-journal-2026-09-18-to-2026-10-17.md`. Prefer the server's filename when we have it. */
export function exportFilename(from: string, to: string, serverName?: string | null): string {
  if (serverName) return serverName;
  return from ? `bihan-journal-${from}-to-${to}.md` : `bihan-journal-to-${to}.md`;
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** "about 6,300 words": round to the nearest 100 once it's big enough to be a guess. */
export function approxWords(n: number): string {
  const rounded = n >= 100 ? Math.round(n / 100) * 100 : n;
  return `about ${plural(rounded, "word", "words")}`;
}

/**
 * The summary under the export preview. `null` means "No entries in this range".
 * `entries` is rendered bold by the modal.
 */
export function exportSummary(
  counts: { entryCount: number; wordCount: number; goalCount: number },
  includeGoals: boolean,
): { entries: string; rest: string } | null {
  if (counts.entryCount === 0) return null;
  const parts = [approxWords(counts.wordCount)];
  if (includeGoals) parts.push(plural(counts.goalCount, "goal", "goals"));
  return { entries: plural(counts.entryCount, "entry", "entries"), rest: ` · ${parts.join(" · ")}` };
}
