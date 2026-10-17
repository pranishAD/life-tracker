import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Download, Lock, Sparkles, X } from "lucide-react";
import type { JournalExportParams } from "../../api/types";
import clsx from "../../lib/clsx";
import { todayIso } from "../../lib/date";
import { EXPORT_PRESETS, exportFilename, exportSummary, presetRange, type ExportPreset } from "../../lib/journal";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useJournalExport } from "../../hooks/useJournal";
import Button from "../Button";
import Toggle from "../Toggle";

const PREVIEW_LINES = 10;

/** Trigger a browser download of text we already have (no second request). */
export function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** "Export for AI" modal (screen 9): pick a range, preview the real file, download it. */
export default function ExportJournalModal({ onClose }: { onClose: () => void }) {
  const today = todayIso();
  const initial = presetRange("30d", today);
  const [preset, setPreset] = useState<ExportPreset | null>("30d");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [includeGoals, setIncludeGoals] = useState(true);

  // Esc closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rangeError = !to ? "Pick an end date." : from && from > to ? "From must be on or before To." : null;

  // `useMemo` keeps the same object between renders unless an input
  // changes, so the debounce below only restarts on a real change.
  const params = useMemo<JournalExportParams | null>(
    () => (rangeError ? null : { from: from || undefined, to, include_goals: includeGoals }),
    [from, to, includeGoals, rangeError],
  );
  const debounced = useDebouncedValue(params, 300);
  const { data, isLoading, isError, isPlaceholderData, refetch } = useJournalExport(debounced);

  // The preview is "current" only when it was fetched for exactly what's on screen.
  const isCurrent = !!data && !isPlaceholderData && debounced === params && params !== null;
  const summary = data ? exportSummary(data, includeGoals) : null;
  const filename = exportFilename(from, to, isCurrent ? data?.filename : null);
  const canDownload = isCurrent && !!data && data.entryCount > 0;

  function pickPreset(p: ExportPreset) {
    const range = presetRange(p, today);
    setPreset(p);
    setFrom(range.from);
    setTo(range.to);
  }

  function handleDownload() {
    if (!canDownload || !data) return;
    downloadText(data.markdown, filename);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-30 bg-overlay backdrop-blur-sm grid items-end md:place-items-center md:p-6" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Export for AI"
        className="w-full md:max-w-[560px] bg-surface-1 border border-border rounded-t-xl md:rounded-xl shadow-modal p-4 pt-3 md:p-8 max-h-[94vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 rounded-sm bg-surface-3 mx-auto mb-4 md:hidden" />

        <div className="flex justify-between items-start gap-4">
          <div>
            <p className="text-label uppercase text-ink-muted mb-1 inline-flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-gold" aria-hidden />
              Export for AI
            </p>
            <h2 className="font-display text-[22px] font-semibold leading-[28px]">Download your journal</h2>
            <p className="text-body-sm text-ink-muted mt-1">
              One Markdown file you can paste into Claude or ChatGPT to ask about your patterns.
            </p>
          </div>
          <button
            className="w-9 h-9 flex-none rounded-full bg-surface-2 grid place-items-center text-ink-muted hover:text-ink focus-visible:shadow-focus focus-visible:outline-none"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Date range */}
        <div className="mt-6">
          <span className="text-body-sm font-medium text-ink-muted">Date range</span>
          <div className="flex gap-2 flex-wrap mt-2">
            {EXPORT_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={preset === p.id}
                onClick={() => pickPreset(p.id)}
                className={clsx(
                  "px-3.5 py-2 rounded-full text-body-sm font-medium focus-visible:shadow-focus focus-visible:outline-none",
                  preset === p.id ? "bg-ink text-bg" : "bg-surface-2 text-ink-muted hover:text-ink",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-end gap-2 md:gap-3 mt-3">
            <DateField
              label="From"
              value={from}
              max={to || today}
              placeholder="First entry"
              onChange={(v) => {
                setFrom(v);
                setPreset(null);
              }}
            />
            <ArrowRight className="hidden md:block w-4 h-4 text-ink-subtle mb-4" aria-hidden />
            <DateField
              label="To"
              value={to}
              max={today}
              onChange={(v) => {
                setTo(v);
                setPreset(null);
              }}
            />
          </div>
          {rangeError && <p className="text-body-sm text-grade-d mt-2">{rangeError}</p>}
        </div>

        <Toggle
          className="bg-surface-2 p-4 mt-5"
          checked={includeGoals}
          onChange={setIncludeGoals}
          label="Include goals and scores"
          description="Adds each goal's score, grade and progress for the same dates, so the AI can link what you wrote to how you did."
        />

        {/* Preview */}
        <div className="mt-5">
          <span className="text-body-sm font-medium text-ink-muted">Preview</span>
          <div
            className={clsx(
              "relative mt-2 bg-bg border border-border rounded-md p-4 h-[200px] overflow-hidden font-mono text-[12px] leading-[18px] transition-opacity",
              !isCurrent && data && "opacity-60",
            )}
            aria-label="File preview"
          >
            {isError ? (
              <div className="flex flex-col items-start gap-2 font-sans">
                <p className="text-body-sm text-grade-d">Couldn't build the preview.</p>
                <Button variant="secondary" size="sm" onClick={() => refetch()}>
                  Try again
                </Button>
              </div>
            ) : isLoading || !data ? (
              <div className="flex flex-col gap-2" aria-label="Loading preview">
                {[70, 45, 0, 55, 80, 65, 40].map((w, i) => (
                  <span key={i} className="h-3 bg-surface-2 rounded-sm animate-pulse" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : (
              <PreviewLines markdown={data.markdown} />
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg to-transparent" />
          </div>
          <p className="text-body-sm text-ink-muted mt-3" aria-live="polite">
            {!data ? (
              "Building preview…"
            ) : summary ? (
              <>
                <b className="text-ink font-semibold">{summary.entries}</b>
                {summary.rest}
              </>
            ) : (
              "No entries in this range"
            )}
          </p>
          <p className="font-mono text-[12px] text-ink-subtle mt-1 break-all">{filename}</p>
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse md:flex-row md:justify-between md:items-center gap-3 border-t border-border mt-6 pt-5">
          <p className="flex items-center justify-center gap-2 text-body-sm text-ink-muted">
            <Lock className="w-4 h-4 flex-none" aria-hidden />
            Downloads to your device only. Nothing is sent to an AI.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} className="hidden md:inline-flex">
              Cancel
            </Button>
            <Button
              icon={<Download className="w-5 h-5" />}
              onClick={handleDownload}
              disabled={!canDownload}
              className="flex-1 md:flex-none justify-center"
            >
              Download .md
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function DateField({
  label,
  value,
  max,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  max: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-body-sm text-ink-muted">{label}</span>
      <input
        type="date"
        value={value}
        max={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface-2 border border-border-strong rounded-md p-3 text-body text-ink outline-none focus:border-gold focus:shadow-focus [color-scheme:dark]"
      />
    </label>
  );
}

/** First ~10 lines of the file: headings in ink, field names ("Mood:") in gold. */
function PreviewLines({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n").slice(0, PREVIEW_LINES);
  return (
    <pre className="whitespace-pre-wrap break-words m-0 font-mono">
      {lines.map((line, i) => (
        <div key={i} className={line.startsWith("#") ? "text-ink font-semibold" : "text-ink-muted"}>
          {line.startsWith("#") ? line : <FieldNames line={line} />}
          {line === "" && " "}
        </div>
      ))}
    </pre>
  );
}

function FieldNames({ line }: { line: string }) {
  const parts = line.split(/(\b(?:Exported|Mood|Tags|Overall):)/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="text-gold">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}
