import { Calendar, X } from "lucide-react";
import clsx from "../../lib/clsx";

interface DateFieldProps {
  id: string;
  value: string; // "" = none
  onChange: (value: string) => void;
  placeholder?: string;
  /** Text on the right, e.g. the "9 weeks" countdown. */
  aside?: string;
  min?: string;
  max?: string;
  /** Show an x to clear (optional dates only). */
  clearable?: boolean;
  invalid?: boolean;
}

/** Native date input styled like `.bh-input` with a calendar icon. A real
 * <input type="date"> keeps the phone's own date picker and keyboard support. */
export default function DateField({ id, value, onChange, placeholder, aside, min, max, clearable, invalid }: DateFieldProps) {
  return (
    <div
      className={clsx(
        "flex items-center gap-2 bg-surface-2 border rounded-md px-3 h-12 text-body focus-within:border-gold focus-within:shadow-focus",
        invalid ? "border-grade-d" : "border-border-strong",
      )}
    >
      <Calendar className="w-4 h-4 text-ink-muted flex-none" strokeWidth={2} aria-hidden="true" />
      <div className="relative flex-1 min-w-0 h-full">
        {/* Show our own placeholder when empty; the browser's "dd/mm/yyyy" is hidden by text-transparent. */}
        {!value && placeholder && (
          <span className="absolute inset-y-0 left-0 flex items-center text-ink-subtle pointer-events-none">{placeholder}</span>
        )}
        <input
          id={id}
          type="date"
          value={value}
          min={min}
          max={max}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
          style={{ colorScheme: "dark" }}
          className={clsx("w-full h-full bg-transparent outline-none", value ? "text-ink" : "text-transparent focus:text-ink")}
        />
      </div>
      {aside && <span className="text-body-sm text-ink-muted flex-none">{aside}</span>}
      {clearable && value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear date"
          className="w-7 h-7 grid place-items-center text-ink-muted hover:text-ink rounded-sm focus-visible:shadow-focus focus-visible:outline-none flex-none"
        >
          <X className="w-4 h-4" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
