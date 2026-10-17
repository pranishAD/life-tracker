// Journal endpoints (docs/api-contract.yaml, tag "journal").
// Everything goes through `apiFetch` / `apiFetchText` in client.ts, so the
// base URL and Bearer token live in one place.
import { apiFetch, apiFetchText } from "./client";
import type {
  JournalEntry,
  JournalEntryCreateRequest,
  JournalEntryPage,
  JournalEntryUpdateRequest,
  JournalExport,
  JournalExportParams,
  JournalListParams,
  JournalStats,
} from "./types";

/** The caller's UTC offset in minutes, east positive (Nepal = 345).
 * JS's getTimezoneOffset() is the other way round (west positive), hence the minus. */
export function tzOffset(): number {
  return -new Date().getTimezoneOffset();
}

/** Blank strings become `undefined` so they're left out of the query string. */
function clean(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

export function listJournalEntries(params: JournalListParams = {}): Promise<JournalEntryPage> {
  return apiFetch<JournalEntryPage>("/journal", {
    query: {
      q: clean(params.q),
      tag: clean(params.tag),
      from: params.from,
      to: params.to,
      tz_offset: tzOffset(),
      limit: params.limit,
      offset: params.offset,
    },
  });
}

export function getJournalStats(month?: string): Promise<JournalStats> {
  return apiFetch<JournalStats>("/journal/stats", { query: { month, tz_offset: tzOffset() } });
}

export function getJournalEntry(entryId: string): Promise<JournalEntry> {
  return apiFetch<JournalEntry>(`/journal/${entryId}`);
}

export function createJournalEntry(body: JournalEntryCreateRequest): Promise<JournalEntry> {
  return apiFetch<JournalEntry>("/journal", { method: "POST", body });
}

export function updateJournalEntry(entryId: string, body: JournalEntryUpdateRequest): Promise<JournalEntry> {
  return apiFetch<JournalEntry>(`/journal/${entryId}`, { method: "PATCH", body });
}

export function deleteJournalEntry(entryId: string): Promise<void> {
  return apiFetch<void>(`/journal/${entryId}`, { method: "DELETE" });
}

function intHeader(headers: Headers, name: string): number {
  const n = Number.parseInt(headers.get(name) ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

/** Pull `filename="…"` out of a Content-Disposition header, if present. */
export function filenameFromDisposition(value: string | null): string | null {
  if (!value) return null;
  const match = /filename="?([^";]+)"?/i.exec(value);
  return match ? match[1] : null;
}

/** Fetch the Markdown export as text (not a browser download) so the modal
 * can preview it and then save the exact same text without a second request. */
export async function exportJournal(params: JournalExportParams): Promise<JournalExport> {
  const { text, headers } = await apiFetchText("/journal/export", {
    query: {
      from: params.from,
      to: params.to,
      include_goals: params.include_goals,
      tz_offset: tzOffset(),
    },
  });
  return {
    markdown: text,
    entryCount: intHeader(headers, "X-Journal-Entry-Count"),
    wordCount: intHeader(headers, "X-Journal-Word-Count"),
    goalCount: intHeader(headers, "X-Journal-Goal-Count"),
    filename: filenameFromDisposition(headers.get("Content-Disposition")),
  };
}
