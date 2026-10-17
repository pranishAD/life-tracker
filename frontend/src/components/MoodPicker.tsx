import type { Mood } from "../api/types";
import clsx from "../lib/clsx";
import { MOOD_LABELS } from "../lib/journal";

/** Editor mood picker: five tiles, same shape as the check-in Effort picker.
 * Tapping the selected tile clears it (mood is optional). */
export default function MoodPicker({ value, onChange }: { value: Mood | null; onChange: (mood: Mood | null) => void }) {
  return (
    <div className="grid grid-cols-5 gap-2" role="group" aria-label="Mood">
      {([1, 2, 3, 4, 5] as Mood[]).map((n) => {
        const selected = value === n;
        return (
          <button
            key={n}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(selected ? null : n)}
            className={clsx(
              "flex flex-col items-center gap-0.5 py-2 rounded-md border",
              "focus-visible:shadow-focus focus-visible:outline-none",
              selected
                ? "bg-grade-s-dim border-gold text-gold"
                : "bg-surface-2 border-transparent text-ink-muted hover:text-ink",
            )}
          >
            <span className="font-display font-bold text-[17px] leading-[22px]">{n}</span>
            <span className="text-[11px] font-medium leading-[14px]">{MOOD_LABELS[n - 1]}</span>
          </button>
        );
      })}
    </div>
  );
}
