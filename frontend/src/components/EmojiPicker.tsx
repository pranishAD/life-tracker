import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import clsx from "../lib/clsx";
import {
  getRecentEmoji,
  loadEmojiIndex,
  pushRecentEmoji,
  searchEmoji,
  suggestForGoal,
  type EmojiIndex,
} from "../lib/emoji";

/** Loads the emoji data the first time a picker mounts. Custom hooks like
 * this are just functions that use other hooks — any component can call it. */
export function useEmojiIndex(): { index: EmojiIndex | null; failed: boolean } {
  const [index, setIndex] = useState<EmojiIndex | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true; // ignore the result if the picker closed meanwhile
    loadEmojiIndex()
      .then((i) => alive && setIndex(i))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);
  return { index, failed };
}

/** Good picks for categories (12b) — shown first, before the data loads too. */
const CATEGORY_PICKS = ["🚀", "💡", "🎨", "🎸", "📷", "🧪", "🌱", "🏠", "✈️", "🍳", "💰", "❤️", "🧠", "🎮", "📈", "🛠️"];

interface EmojiPickerProps {
  selected: string | null;
  onSelect: (emoji: string) => void;
  /** Goal name, for the "Suggested for …" row (goal picker only). */
  goalName?: string;
  /** Category dialog: one flat grid, ~2 rows visible, no section headings. */
  compact?: boolean;
  /** Max height of the scrolling area (px). */
  maxHeight?: number;
}

interface Section {
  id: string;
  label: string;
  emojis: string[];
}

/** Search field + scrolling emoji grid (components.md "EmojiPicker").
 * Data from @emoji-mart/data, styled by us. Arrow keys move around the grid;
 * only one emoji is in the Tab order at a time ("roving tabindex"). */
export default function EmojiPicker({ selected, onSelect, goalName, compact, maxHeight = 232 }: EmojiPickerProps) {
  const { index, failed } = useEmojiIndex();
  const [query, setQuery] = useState("");
  // Read recents once per open (useState with a function runs it only once).
  const [recent] = useState(getRecentEmoji);
  const gridRef = useRef<HTMLDivElement>(null);

  const sections: Section[] = useMemo(() => {
    if (query.trim()) {
      return index ? [{ id: "results", label: "Results", emojis: searchEmoji(index, query).map((e) => e.native) }] : [];
    }
    const out: Section[] = [];
    if (recent.length) out.push({ id: "recent", label: "Recent", emojis: recent });
    if (compact) {
      out.push({ id: "picks", label: "Suggested", emojis: CATEGORY_PICKS });
    } else {
      const suggested = suggestForGoal(index, goalName ?? "");
      if (suggested) out.push({ id: "suggested", label: `Suggested for ${suggested.label}`, emojis: suggested.emojis });
    }
    for (const s of index?.sections ?? []) out.push({ id: s.id, label: s.label, emojis: s.emojis.map((e) => e.native) });
    if (compact) {
      // One flat grid without repeats.
      const seen = new Set<string>();
      const flat = out.flatMap((s) => s.emojis).filter((e) => (seen.has(e) ? false : (seen.add(e), true)));
      return [{ id: "all", label: "Emoji", emojis: flat }];
    }
    return out;
  }, [query, index, recent, compact, goalName]);

  // Which emoji is tabbable: the selected one if visible, else the first.
  const flat = sections.flatMap((s) => s.emojis);
  const tabTarget = selected && flat.includes(selected) ? selected : flat[0];

  function pick(emoji: string) {
    pushRecentEmoji(emoji);
    onSelect(emoji);
  }

  function onGridKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 8, ArrowUp: -8 };
    if (!(e.key in keys)) return;
    const buttons = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>("button[data-emoji]") ?? []);
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, i + keys[e.key]))]?.focus();
  }

  let tabAssigned = false;
  return (
    <div className="flex flex-col gap-3">
      <label className="h-10 flex items-center gap-2 bg-surface-2 border border-border-strong rounded-md px-3 text-ink-muted focus-within:border-gold focus-within:shadow-focus">
        <Search className="w-4 h-4 flex-none" strokeWidth={2} />
        <input
          className="flex-1 min-w-0 bg-transparent outline-none text-body text-ink placeholder:text-ink-subtle"
          placeholder="Search emoji"
          aria-label="Search emoji"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div
        ref={gridRef}
        className="overflow-y-auto flex flex-col gap-3 -mx-1 px-1"
        style={{ maxHeight }}
        onKeyDown={onGridKeyDown}
      >
        {sections.map((s) => (
          <div key={s.id}>
            {!compact && <p className="text-label uppercase text-ink-muted mb-2">{s.label}</p>}
            {s.emojis.length === 0 ? (
              <p className="text-body-sm text-ink-muted py-2">No emoji match "{query.trim()}".</p>
            ) : (
              <div className="grid grid-cols-8 gap-1">
                {s.emojis.map((emoji, i) => {
                  const on = emoji === selected;
                  const tabbable = !tabAssigned && emoji === tabTarget;
                  if (tabbable) tabAssigned = true;
                  return (
                    <button
                      key={`${s.id}-${i}`}
                      type="button"
                      data-emoji
                      tabIndex={tabbable ? 0 : -1}
                      aria-label={emoji}
                      aria-pressed={on}
                      onClick={() => pick(emoji)}
                      className={clsx(
                        "aspect-square grid place-items-center rounded-sm text-[22px] font-emoji leading-none",
                        "focus-visible:shadow-focus focus-visible:outline-none",
                        on ? "bg-grade-s-dim shadow-[inset_0_0_0_1.5px_#ffc93c]" : "hover:bg-surface-2",
                      )}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {!index && !failed && (
          <div className="grid grid-cols-8 gap-1" aria-hidden="true">
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} className="aspect-square rounded-sm bg-surface-2 animate-pulse" />
            ))}
          </div>
        )}
        {failed && <p className="text-body-sm text-grade-d">Couldn't load the emoji list. Close and try again.</p>}
      </div>
    </div>
  );
}
