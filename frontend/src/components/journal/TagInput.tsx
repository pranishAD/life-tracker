import { useState, type KeyboardEvent } from "react";
import { addTags, MAX_TAGS } from "../../lib/journal";
import TagChip from "../TagChip";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Most-used tags not yet on this entry (2-4 of them). */
  suggestions: string[];
}

/**
 * Editor tag input. Enter or comma adds the typed tag, Backspace on an
 * empty input removes the last one. Tags are normalised exactly like the
 * backend does (lowercase, spaces → "-", no "#"), max 10.
 *
 * `text` is a "controlled input": React state holds the value and the
 * <input> just displays it, so we can clear it after adding a tag.
 */
export default function TagInput({ tags, onChange, suggestions }: TagInputProps) {
  const [text, setText] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const full = tags.length >= MAX_TAGS;

  function commit(raw: string) {
    if (!raw.trim()) return;
    const { tags: next, rejected } = addTags(tags, raw);
    if (next.length !== tags.length) onChange(next);
    setText("");
    setHint(
      rejected.length === 0
        ? null
        : next.length >= MAX_TAGS
          ? `Max ${MAX_TAGS} tags.`
          : "Tags can use letters, numbers, - and _ (up to 32).",
    );
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(text);
    } else if (e.key === "Backspace" && text === "" && tags.length > 0) {
      e.preventDefault();
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 bg-surface-2 border border-border-strong rounded-md min-h-[52px] px-3 py-2 focus-within:border-gold focus-within:shadow-focus">
        {tags.map((t) => (
          <TagChip key={t} tag={t} onRemove={() => onChange(tags.filter((x) => x !== t))} />
        ))}
        <input
          value={text}
          onChange={(e) => {
            // A pasted "gym, legs" arrives in one change event: add the
            // complete parts, keep whatever comes after the last comma.
            const value = e.target.value;
            if (value.includes(",")) {
              const lastComma = value.lastIndexOf(",");
              commit(value.slice(0, lastComma));
              setText(value.slice(lastComma + 1));
            } else {
              setText(value);
            }
          }}
          onKeyDown={onKeyDown}
          onBlur={() => commit(text)}
          disabled={full}
          placeholder={full ? `Max ${MAX_TAGS} tags` : "Add tag"}
          aria-label="Add tag"
          className="flex-1 min-w-[80px] bg-transparent text-body text-ink placeholder:text-ink-subtle outline-none py-1"
        />
      </div>
      {hint && <p className="text-body-sm text-grade-d mt-1.5">{hint}</p>}
      {suggestions.length > 0 && !full && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
          <span className="text-body-sm text-ink-subtle mr-1">Suggested</span>
          {suggestions.map((t) => (
            <TagChip key={t} tag={t} onClick={() => commit(t)} />
          ))}
        </div>
      )}
    </div>
  );
}
