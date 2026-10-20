import { Minus, Plus } from "lucide-react";

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** What the number means, for screen readers ("Times a week"). */
  label: string;
}

/** − value + (components.md "Stepper"). Buttons disable at the ends. */
export default function Stepper({ value, onChange, min, max, label }: StepperProps) {
  const btn =
    "w-11 h-11 grid place-items-center text-ink disabled:text-ink-subtle disabled:cursor-not-allowed rounded-md focus-visible:shadow-focus focus-visible:outline-none";
  return (
    <div className="inline-flex items-center bg-surface-2 border border-border-strong rounded-md" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="Fewer">
        <Minus className="w-4 h-4" strokeWidth={2} />
      </button>
      {/* <output> + aria-live: screen readers announce the new number on each press. */}
      <output aria-live="polite" className="min-w-[40px] text-center font-display font-bold text-[20px] leading-6 tabular-nums">
        {value}
      </output>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="More">
        <Plus className="w-4 h-4" strokeWidth={2} />
      </button>
    </div>
  );
}
