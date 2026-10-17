import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as journalApi from "../api/journal";
import type { JournalEntry, JournalEntryUpdateRequest, Mood } from "../api/types";
import { journalKeys } from "./useJournal";

export interface JournalDraft {
  title: string;
  body: string;
  mood: Mood | null;
  tags: string[];
}

export type SaveStatus =
  | { kind: "unsaved" } // "Not saved yet"
  | { kind: "saving" } // "Saving…"
  | { kind: "saved"; at: Date } // "Saved · 4:58 PM"
  | { kind: "error" }; // "Couldn't save. Retrying…"

const EMPTY_DRAFT: JournalDraft = { title: "", body: "", mood: null, tags: [] };

export function draftFromEntry(entry: JournalEntry): JournalDraft {
  return { title: entry.title ?? "", body: entry.body, mood: entry.mood, tags: [...entry.tags] };
}

function sameTags(a: string[], b: string[]) {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

export function draftsEqual(a: JournalDraft, b: JournalDraft): boolean {
  return a.title === b.title && a.body === b.body && a.mood === b.mood && sameTags(a.tags, b.tags);
}

const hasText = (s: string) => s.trim().length > 0;
const titleForApi = (title: string) => (hasText(title) ? title.trim() : null);

/** Only the fields that changed since the last save (PATCH is partial). */
function diff(saved: JournalDraft, next: JournalDraft): JournalEntryUpdateRequest {
  const patch: JournalEntryUpdateRequest = {};
  if (next.title !== saved.title) patch.title = titleForApi(next.title);
  if (next.body !== saved.body) patch.body = next.body;
  if (next.mood !== saved.mood) patch.mood = next.mood;
  if (!sameTags(next.tags, saved.tags)) patch.tags = next.tags;
  return patch;
}

interface Options {
  /** The entry being edited, or `null` for a brand-new one. Read once, on mount. */
  initialEntry: JournalEntry | null;
  /** Called once, right after the first POST creates the entry. */
  onCreated?: (entry: JournalEntry) => void;
  /** Wait this long after the last change before saving. */
  delayMs?: number;
  /** After a failed save, try again after this long. */
  retryMs?: number;
}

/**
 * Autosave for the journal editor.
 *
 * - Every change restarts a 1s timer; when it fires we save.
 * - No entry yet: we POST once the body has real text (the API requires a
 *   body). After that, every save is a PATCH of just the changed fields.
 * - Only one request is ever in flight. A save that's requested while one
 *   is running waits for it, then re-checks — so one editor session can
 *   never create two entries, even if the user types during the first POST.
 *
 * Why refs (`useRef`) and not only state? Timers and async code capture the
 * values from the render they were created in. Refs are a mutable box that
 * always holds the latest value, so the save logic never works on a stale
 * draft. The `useState` copies exist only so the screen re-renders.
 */
export function useJournalAutosave({ initialEntry, onCreated, delayMs = 1000, retryMs = 3000 }: Options) {
  const qc = useQueryClient();

  const initialDraft = initialEntry ? draftFromEntry(initialEntry) : EMPTY_DRAFT;
  const [draft, setDraftState] = useState<JournalDraft>(initialDraft);
  const [savedDraft, setSavedDraftState] = useState<JournalDraft>(initialDraft);
  const [status, setStatus] = useState<SaveStatus>(
    initialEntry ? { kind: "saved", at: new Date(initialEntry.updated_at) } : { kind: "unsaved" },
  );
  const [entry, setEntry] = useState<JournalEntry | null>(initialEntry);

  const draftRef = useRef(initialDraft);
  const savedRef = useRef(initialDraft);
  const entryIdRef = useRef<string | null>(initialEntry?.id ?? null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const retryRef = useRef<number | undefined>(undefined);
  const stoppedRef = useRef(false);
  const lastSavedAtRef = useRef<Date | null>(initialEntry ? new Date(initialEntry.updated_at) : null);
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  const clearTimers = () => {
    window.clearTimeout(timerRef.current);
    window.clearTimeout(retryRef.current);
  };

  // Stop all timers when the editor closes. (The `= false` on setup matters:
  // in dev, React StrictMode runs mount → unmount → mount once to catch bugs,
  // and we must be "running" again after that second mount.)
  useEffect(() => {
    stoppedRef.current = false;
    return () => {
      stoppedRef.current = true;
      clearTimers();
    };
  }, []);

  /** Status to show when nothing is saving right now. */
  const restingStatus = useCallback((): SaveStatus => {
    const dirty = !draftsEqual(draftRef.current, savedRef.current);
    if (!entryIdRef.current || (dirty && !hasText(draftRef.current.body))) return { kind: "unsaved" };
    return lastSavedAtRef.current ? { kind: "saved", at: lastSavedAtRef.current } : { kind: "unsaved" };
  }, []);

  /** One save request. Never called while another is in flight (see `flush`). */
  const saveOnce = useCallback(
    async (snapshot: JournalDraft) => {
      setStatus({ kind: "saving" });
      let saved: JournalEntry;
      if (!entryIdRef.current) {
        saved = await journalApi.createJournalEntry({
          title: titleForApi(snapshot.title),
          body: snapshot.body,
          mood: snapshot.mood,
          tags: snapshot.tags,
        });
        entryIdRef.current = saved.id;
        onCreatedRef.current?.(saved);
      } else {
        saved = await journalApi.updateJournalEntry(entryIdRef.current, diff(savedRef.current, snapshot));
      }
      savedRef.current = snapshot;
      lastSavedAtRef.current = new Date();
      setSavedDraftState(snapshot);
      setEntry(saved);
      // Keep the cache in sync: the entry itself, and mark the list/stats
      // stale so the Journal page refetches when you go back to it.
      qc.setQueryData(journalKeys.entry(saved.id), saved);
      qc.invalidateQueries({ queryKey: ["journal", "list"] });
      qc.invalidateQueries({ queryKey: ["journal", "stats"] });
    },
    [qc],
  );

  /**
   * Save now (skipping the timer). Resolves `true` when everything that
   * can be saved is saved, `false` if the save failed or there's nothing
   * valid to save yet (new entry with a blank body).
   */
  const flush = useCallback(async (): Promise<boolean> => {
    clearTimers();
    // Wait for any running save. Loop because another caller may have
    // started a new one in the meantime; the check-and-start below has no
    // `await` between them, so only one caller can win.
    while (inFlightRef.current) {
      await inFlightRef.current.catch(() => undefined);
    }
    if (stoppedRef.current) return false;

    const current = draftRef.current;
    if (draftsEqual(current, savedRef.current)) {
      setStatus(restingStatus());
      return true;
    }
    let snapshot = current;
    if (!hasText(current.body)) {
      // The API never accepts a blank body. New entry: wait for text.
      // Existing entry: save the other fields, keep the old body for now.
      if (!entryIdRef.current) {
        setStatus({ kind: "unsaved" });
        return false;
      }
      snapshot = { ...current, body: savedRef.current.body };
      if (draftsEqual(snapshot, savedRef.current)) {
        setStatus({ kind: "unsaved" });
        return false;
      }
    }

    const request = saveOnce(snapshot);
    inFlightRef.current = request;
    try {
      await request;
      if (stoppedRef.current) return true;
      const stillDirty = !draftsEqual(draftRef.current, savedRef.current);
      // More typing arrived during the save: its timer will save it shortly.
      setStatus(stillDirty && hasText(draftRef.current.body) ? { kind: "saving" } : restingStatus());
      return !stillDirty;
    } catch {
      if (stoppedRef.current) return false;
      setStatus({ kind: "error" });
      retryRef.current = window.setTimeout(() => void flush(), retryMs);
      return false;
    } finally {
      if (inFlightRef.current === request) inFlightRef.current = null;
    }
  }, [restingStatus, retryMs, saveOnce]);

  /** Apply a change from the editor and (re)start the autosave timer. */
  const update = useCallback(
    (patch: Partial<JournalDraft>) => {
      const next = { ...draftRef.current, ...patch };
      draftRef.current = next;
      setDraftState(next);
      if (!entryIdRef.current && !hasText(next.body)) setStatus({ kind: "unsaved" });
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void flush(), delayMs);
    },
    [delayMs, flush],
  );

  /** Stop autosaving for good (used right before deleting the entry). */
  const stop = useCallback(() => {
    stoppedRef.current = true;
    clearTimers();
  }, []);

  return {
    draft,
    update,
    flush,
    stop,
    status,
    entry,
    entryId: entry?.id ?? null,
    isDirty: !draftsEqual(draft, savedDraft),
  };
}
