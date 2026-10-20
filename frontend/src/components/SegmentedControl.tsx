import type { ReactNode } from "react";
import clsx from "../lib/clsx";

export interface Segment<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group, e.g. "Goal type". */
  label: string;
  disabled?: boolean;
  /** Inside a surface-2 block the track switches to surface-1. */
  onSurface2?: boolean;
}

/** Equal-width segments (components.md "SegmentedControl"). Each segment is
 * a button with aria-pressed, so Tab + Enter/Space work.
 * `<T extends string>` makes it generic: `value`/`onChange` are typed to the
 * exact options you pass in ("numeric" | "habit" | …). */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
  onSurface2,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={clsx(
        "grid auto-cols-fr grid-flow-col rounded-md p-[3px] gap-0.5",
        onSurface2 ? "bg-surface-1" : "bg-surface-2",
        disabled && "opacity-55",
      )}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={clsx(
              "py-2 px-2.5 rounded-[9px] text-body-sm font-medium inline-flex items-center justify-center gap-1.5",
              "focus-visible:shadow-focus focus-visible:outline-none",
              on ? "bg-surface-3 text-ink shadow-[0_1px_2px_rgba(0,0,0,.4)]" : "text-ink-muted",
              disabled ? "cursor-not-allowed" : !on && "hover:text-ink",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
