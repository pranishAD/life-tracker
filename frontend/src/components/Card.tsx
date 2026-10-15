import type { HTMLAttributes, ReactNode } from "react";
import clsx from "../lib/clsx";
import { gradeCssVars, type GradeKey } from "../lib/grade";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  interactive?: boolean;
  /** Sets data-grade so children (ScoreRing, hero glow, etc.) can pick up --g / --g-dim. */
  grade?: GradeKey;
}

/** Card per design/components.md. `grade` sets the `--g`/`--g-dim` CSS vars
 * that ScoreRing, GradeBadge and ProgressBar read, mirroring the HTML
 * reference's `[data-grade]` selectors. */
export default function Card({ children, interactive, grade, className, style, ...rest }: CardProps) {
  const vars = grade ? gradeCssVars(grade) : undefined;
  return (
    <div
      className={clsx(
        "bg-surface-1 border border-border rounded-lg p-4 md:p-6",
        interactive && "cursor-pointer hover:bg-surface-2 hover:border-border-strong transition",
        className,
      )}
      data-grade={grade}
      style={{ ...vars, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
