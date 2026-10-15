import clsx from "../lib/clsx";
import { gradeCssVars, gradeLabel, keyToLetter, type GradeKey } from "../lib/grade";

interface GradeBadgeProps {
  grade: GradeKey;
  size?: "sm" | "md" | "lg";
  /** Show the uppercase grade name next to the letter box. */
  showLabel?: boolean;
  className?: string;
}

const BOX_SIZE: Record<NonNullable<GradeBadgeProps["size"]>, string> = {
  sm: "w-7 h-7 text-[15px] rounded-sm border",
  md: "w-12 h-12 text-[28px] rounded-md border-[1.5px]",
  lg: "w-[72px] h-[72px] text-[40px] rounded-lg border-[1.5px]",
};

/** Rounded-square grade letter, per design/components.md "GradeBadge". */
export default function GradeBadge({ grade, size = "md", showLabel, className }: GradeBadgeProps) {
  const isS = grade === "s";
  const isCal = grade === "cal";

  return (
    <div className={clsx("inline-flex items-center gap-2", className)} style={gradeCssVars(grade)}>
      <div
        className={clsx(
          "font-display font-extrabold grid place-items-center flex-none",
          BOX_SIZE[size],
          isS
            ? "bg-gold text-ink-on-gold shadow-glow-s border-transparent"
            : "border-[var(--g)] text-[var(--g)]",
          !isS && !isCal && "bg-[var(--g-dim)]",
          isCal && "border-dashed text-[18px] bg-transparent",
        )}
      >
        {keyToLetter(grade)}
      </div>
      {showLabel && (
        <span className="text-label uppercase" style={{ color: "var(--g)" }}>
          {isCal ? "Calibrating" : gradeLabel(grade)}
        </span>
      )}
    </div>
  );
}
