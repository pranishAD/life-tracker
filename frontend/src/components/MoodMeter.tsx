import clsx from "../lib/clsx";
import { moodLabel } from "../lib/journal";

const BAR_HEIGHTS = [5, 7, 9, 11, 14];

/** Read-only mood on entry cards: five rising bars + the word.
 * Gold, never grade colours (mood isn't a score). No mood → nothing. */
export default function MoodMeter({ mood }: { mood: number | null }) {
  if (!mood) return null;
  const label = moodLabel(mood);
  return (
    <span className="inline-flex items-center gap-1.5" role="img" aria-label={`Mood ${mood} of 5, ${label}`}>
      <span className="inline-flex items-end gap-0.5" aria-hidden>
        {BAR_HEIGHTS.map((h, i) => (
          <i key={h} className={clsx("w-[3px] rounded-[1px]", i < mood ? "bg-gold" : "bg-surface-3")} style={{ height: h }} />
        ))}
      </span>
      <span className="text-body-sm text-ink-muted" aria-hidden>
        {label}
      </span>
    </span>
  );
}
