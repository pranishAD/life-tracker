import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Calendar, ChevronLeft, Ellipsis, Trash2 } from "lucide-react";
import type { JournalEntry } from "../api/types";
import { ApiError } from "../api/client";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import ErrorState from "../components/ErrorState";
import MoodPicker from "../components/MoodPicker";
import Skeleton from "../components/Skeleton";
import TagInput from "../components/journal/TagInput";
import { useToast } from "../context/ToastContext";
import { useDeleteJournalEntry, useJournalEntry, useJournalStats } from "../hooks/useJournal";
import { useJournalAutosave, type SaveStatus } from "../hooks/useJournalAutosave";
import clsx from "../lib/clsx";
import { formatEntryDateTime, formatTime, suggestedTags, wordCount } from "../lib/journal";

const LEAVE_MESSAGE = "You have unsaved changes. Leave anyway?";

/**
 * Route `/journal/:entryId`, where entryId is a real id or "new".
 *
 * Both `/journal/new` and `/journal/<id>` use this one route on purpose:
 * after the first autosave creates the entry we swap the URL to
 * `/journal/<id>`, and because it's still the same route React keeps this
 * component (and the editor inside it) mounted — no reload, no lost focus.
 */
export default function JournalEditorPage() {
  const { entryId = "new" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const prompt = (location.state as { prompt?: string } | null)?.prompt;

  // Which entry this editor session is about. It only changes if the URL
  // points somewhere other than the entry we just created ourselves.
  const [sessionId, setSessionId] = useState(entryId);
  const createdIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (entryId !== sessionId && entryId !== createdIdRef.current) setSessionId(entryId);
  }, [entryId, sessionId]);

  const isNew = sessionId === "new";
  const entryQuery = useJournalEntry(isNew ? undefined : sessionId);

  const handleCreated = useCallback(
    (entry: JournalEntry) => {
      createdIdRef.current = entry.id;
      navigate(`/journal/${entry.id}`, { replace: true, state: location.state });
    },
    [navigate, location.state],
  );

  if (!isNew && entryQuery.isLoading) {
    return (
      <div className="min-h-screen bg-bg text-ink">
        <div className="max-w-[720px] mx-auto px-6 pt-24 flex flex-col gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (!isNew && (entryQuery.isError || !entryQuery.data)) {
    const notFound = entryQuery.error instanceof ApiError && entryQuery.error.status === 404;
    return (
      <div className="min-h-screen bg-bg text-ink px-4 md:px-12 py-4">
        <BackLink onClick={() => navigate("/journal")} />
        <div className="max-w-[720px] mx-auto pt-16">
          <ErrorState
            message={notFound ? "This entry doesn't exist any more." : "Couldn't load this entry."}
            onRetry={notFound ? undefined : () => entryQuery.refetch()}
          />
        </div>
      </div>
    );
  }

  return (
    <JournalEditor
      // `key` = "start a fresh editor when the session changes".
      key={sessionId}
      initialEntry={isNew ? null : (entryQuery.data ?? null)}
      prompt={prompt}
      onCreated={handleCreated}
    />
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <Link
      to="/journal"
      onClick={(e) => {
        // We decide when to leave (after saving / confirming), not the link.
        e.preventDefault();
        onClick();
      }}
      className="inline-flex items-center gap-1 text-body font-medium text-ink-muted hover:text-ink rounded-sm focus-visible:shadow-focus focus-visible:outline-none"
    >
      <ChevronLeft className="w-5 h-5" />
      Journal
    </Link>
  );
}

interface EditorProps {
  initialEntry: JournalEntry | null;
  prompt?: string;
  onCreated: (entry: JournalEntry) => void;
}

export function JournalEditor({ initialEntry, prompt, onCreated }: EditorProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { draft, update, flush, stop, status, entry, isDirty } = useJournalAutosave({ initialEntry, onCreated });
  const { data: stats } = useJournalStats();
  const deleteMutation = useDeleteJournalEntry();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openedAt] = useState(() => new Date());
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const leavingRef = useRef(false);

  const words = wordCount(draft.body);
  const exists = entry !== null;
  const dateLine = formatEntryDateTime(entry ? new Date(entry.created_at) : openedAt);

  // Auto-grow the body: reset the height, then set it to the content's height.
  // useLayoutEffect runs before the browser paints, so there's no flicker.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft.body]);

  // New entry: put the cursor in the body straight away.
  useEffect(() => {
    if (!initialEntry) bodyRef.current?.focus();
  }, [initialEntry]);

  /** Back / Esc / Done: save what we can, confirm only if something would be lost. */
  const leave = useCallback(async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    const ok = isDirty || status.kind === "saving" ? await flush() : true;
    if (!ok && !window.confirm(LEAVE_MESSAGE)) {
      leavingRef.current = false;
      return;
    }
    stop();
    navigate("/journal");
  }, [flush, isDirty, navigate, status.kind, stop]);

  // Keyboard: Ctrl/Cmd+Enter = Done, Esc = back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmDelete) return;
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void leave();
      } else if (e.key === "Escape") {
        if (menuOpen) setMenuOpen(false);
        else void leave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDelete, leave, menuOpen]);

  // Closing the tab / reloading with unsaved changes: the browser's own prompt.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  async function handleDelete() {
    if (!entry) return;
    stop(); // no autosave may run after (or during) a delete
    try {
      await deleteMutation.mutateAsync(entry.id);
      showToast("Entry deleted.");
      navigate("/journal");
    } catch {
      // Error text is shown in the dialog; leave the editor as it was.
    }
  }

  const suggestions = suggestedTags(stats?.tags ?? [], draft.tags, 4);

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-bg/90 backdrop-blur px-4 py-3 md:px-12 md:py-4 flex items-center justify-between gap-3">
        <BackLink onClick={() => void leave()} />
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <SaveStatusText status={status} onRetry={() => void flush()} />
          <span className="hidden md:inline text-body-sm text-ink-subtle">
            {words} {words === 1 ? "word" : "words"}
          </span>
          {exists && (
            <button
              type="button"
              aria-label="Delete entry"
              onClick={() => setConfirmDelete(true)}
              className="hidden md:grid w-9 h-9 place-items-center rounded-md text-ink-muted hover:text-ink hover:bg-surface-2 focus-visible:shadow-focus focus-visible:outline-none"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          {exists && (
            <div className="relative md:hidden">
              <button
                type="button"
                aria-label="More options"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
                className="w-9 h-9 grid place-items-center rounded-md text-ink-muted hover:text-ink hover:bg-surface-2 focus-visible:shadow-focus focus-visible:outline-none"
              >
                <Ellipsis className="w-5 h-5" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-11 z-20 min-w-[180px] bg-surface-2 border border-border rounded-md shadow-modal p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmDelete(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-sm text-body text-grade-d hover:bg-surface-3"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete entry
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          <Button size="sm" onClick={() => void leave()}>
            {exists ? "Done" : "Save"}
          </Button>
        </div>
      </div>

      {/* Writing column */}
      <div className="max-w-[720px] mx-auto px-6 pt-8 pb-[300px] md:pb-[220px]">
        <p className="inline-flex items-center gap-2 text-body-sm text-ink-muted">
          <Calendar className="w-4 h-4" aria-hidden />
          {dateLine}
        </p>
        <input
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Title (optional)"
          aria-label="Title"
          maxLength={120}
          className="block w-full mt-4 bg-transparent outline-none font-display font-semibold text-[24px] leading-[30px] md:text-[32px] md:leading-[40px] text-ink placeholder:text-border-strong"
        />
        <textarea
          ref={bodyRef}
          value={draft.body}
          onChange={(e) => update({ body: e.target.value })}
          placeholder={prompt ?? "What's on your mind?"}
          aria-label="Entry"
          maxLength={50000}
          rows={4}
          className="block w-full mt-4 bg-transparent outline-none resize-none overflow-hidden text-[17px] leading-[28px] md:text-[18px] md:leading-[30px] text-ink placeholder:text-ink-subtle"
        />
      </div>

      {/* Details panel: floating card on desktop, bottom sheet on mobile */}
      <div
        className={clsx(
          "fixed z-10 bg-surface-1 border border-border shadow-modal",
          "inset-x-0 bottom-0 rounded-t-xl px-4 pt-4 pb-5 flex flex-col gap-4",
          "md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:bottom-6 md:w-[calc(100%-48px)] md:max-w-[720px] md:rounded-xl",
          "md:px-5 md:py-4 md:grid md:grid-cols-[300px_1fr] md:gap-6",
        )}
      >
        <div>
          <p className="text-label uppercase text-ink-muted mb-2">
            Mood <span className="normal-case tracking-normal font-normal text-ink-subtle ml-1">optional</span>
          </p>
          <MoodPicker value={draft.mood} onChange={(mood) => update({ mood })} />
        </div>
        <div className="min-w-0">
          <p className="text-label uppercase text-ink-muted mb-2 flex justify-between">
            Tags
            <span className="md:hidden normal-case tracking-normal font-normal text-ink-subtle">
              {words} {words === 1 ? "word" : "words"}
            </span>
          </p>
          <TagInput tags={draft.tags} onChange={(tags) => update({ tags })} suggestions={suggestions} />
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this entry?"
          message="This can't be undone."
          confirmLabel="Delete"
          busyLabel="Deleting…"
          destructive
          busy={deleteMutation.isPending}
          error={deleteMutation.isError ? "Couldn't delete it. Try again." : null}
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

/** "Not saved yet" / "Saving…" / "Saved · 4:58 PM" / "Couldn't save. Retrying…" */
export function SaveStatusText({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  switch (status.kind) {
    case "unsaved":
      return <span className="text-body-sm text-ink-subtle truncate" role="status">Not saved yet</span>;
    case "saving":
      return <span className="text-body-sm text-ink-muted truncate" role="status">Saving…</span>;
    case "saved":
      return (
        <span className="inline-flex items-center gap-2 text-body-sm text-ink-muted truncate" role="status">
          <i className="w-1.5 h-1.5 rounded-full bg-grade-a flex-none" aria-hidden />
          Saved · {formatTime(status.at)}
        </span>
      );
    case "error":
      return (
        <button
          type="button"
          onClick={onRetry}
          role="status"
          title="Retry now"
          className="text-body-sm text-grade-d truncate hover:underline rounded-sm focus-visible:shadow-focus focus-visible:outline-none"
        >
          Couldn't save. Retrying…
        </button>
      );
  }
}
