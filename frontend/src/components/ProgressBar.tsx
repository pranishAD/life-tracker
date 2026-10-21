import clsx from "../lib/clsx";
import { gradeCssVars, type GradeKey } from "../lib/grade";

interface ProgressBarProps {
  percent: number;
  grade: GradeKey;
  /** 0-100 position of the "expected by today" tick (components.md's pace
   * tick). Omit for goals with no deadline. */
  paceTick?: number;
  thin?: boolean;
  metaLeft?: string;
  metaRight?: string;
  /** Accessible name for screen readers. */
  label?: string;
  className?: string;
}

/** Progress track + fill (+ optional pace tick), per design/components.md "ProgressBar". */
export default function ProgressBar({
  percent,
  grade,
  paceTick,
  thin,
  metaLeft,
  metaRight,
  label = "Progress",
  className,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={clsx("w-full", className)} style={gradeCssVars(grade)}>
      {(metaLeft || metaRight) && (
        <div className="flex justify-between text-body-sm text-ink-muted mb-2">
          <span>{metaLeft}</span>
          <span className="text-ink font-semibold">{metaRight}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        className={clsx("relative rounded-full bg-surface-2", thin ? "h-1.5" : "h-2.5")}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${clamped}%`, backgroundColor: "var(--g)" }}
        />
        {paceTick !== undefined && (
          <div
            className="absolute -top-1 w-0.5 h-[18px] bg-ink opacity-70 rounded-sm"
            style={{ left: `${Math.max(0, Math.min(100, paceTick))}%` }}
            title="Expected today"
          />
        )}
      </div>
    </div>
  );
}
