import type { ReactNode } from "react";
import clsx from "../lib/clsx";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Row title (the switch's accessible name). */
  label: ReactNode;
  description?: ReactNode;
  className?: string;
}

/** Toggle per design/components.md: the whole row is the click target,
 * with `role="switch"` + `aria-checked` so screen readers announce on/off. */
export default function Toggle({ checked, onChange, label, description, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        "w-full flex items-center justify-between gap-4 text-left rounded-md",
        "focus-visible:shadow-focus focus-visible:outline-none",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-body font-semibold text-ink">{label}</span>
        {description && <span className="block text-body-sm text-ink-muted mt-1">{description}</span>}
      </span>
      <span
        aria-hidden
        className={clsx(
          "relative flex-none w-11 h-[26px] rounded-full border transition-colors duration-150",
          checked ? "bg-gold border-gold" : "bg-surface-3 border-border-strong",
        )}
      >
        <span
          className={clsx(
            "absolute top-[2px] left-[2px] w-5 h-5 rounded-full transition-transform duration-150",
            checked ? "bg-ink-on-gold translate-x-[18px]" : "bg-ink-muted",
          )}
        />
      </span>
    </button>
  );
}
