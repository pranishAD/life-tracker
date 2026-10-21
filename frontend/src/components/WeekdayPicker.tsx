import clsx from "../lib/clsx";
import { WEEKDAYS } from "../lib/frequency";
import type { Weekday } from "../api/types";

interface WeekdayPickerProps {
  value: Weekday[];
  onChange: (days: Weekday[]) => void;
}

/** M T W T F S S toggles, Monday first (components.md "WeekdayPicker").
 * At least one day always stays selected. */
export default function WeekdayPicker({ value, onChange }: WeekdayPickerProps) {
  function toggle(day: Weekday) {
    if (value.includes(day)) {
      if (value.length === 1) return; // keep at least one day
      onChange(value.filter((d) => d !== day));
    } else {
      onChange([...value, day].sort((a, b) => a - b));
    }
  }
  return (
    <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Days of the week">
      {WEEKDAYS.map((d) => {
        const on = value.includes(d.day);
        return (
          <button
            key={d.day}
            type="button"
            aria-label={d.long}
            aria-pressed={on}
            onClick={() => toggle(d.day)}
            className={clsx(
              "h-11 rounded-md grid place-items-center text-body-sm font-semibold",
              "focus-visible:shadow-focus focus-visible:outline-none",
              on ? "bg-gold text-ink-on-gold" : "bg-surface-2 text-ink-muted hover:text-ink",
            )}
          >
            {d.letter}
          </button>
        );
      })}
    </div>
  );
}
