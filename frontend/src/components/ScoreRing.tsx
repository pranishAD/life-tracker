import clsx from "../lib/clsx";
import { gradeCssVars, gradeLabel, type GradeKey } from "../lib/grade";
import { computeRingGeometry } from "../lib/scoreRing";

interface ScoreRingProps {
  /** null = Calibrating (shows a dashed track and "–"). */
  score: number | null;
  grade: GradeKey;
  size: number;
  strokeWidth: number;
  /** Small label above the number, e.g. "Overall". */
  label?: string;
  /** Show the grade name under the number (hero/md sizes only, per components.md). */
  showCaption?: boolean;
  scoreFontSize?: number;
  className?: string;
}

/**
 * SVG arc ring, 0-100, starting at 12 o'clock going clockwise — achieved by
 * rotating the whole <svg> -90deg and letting stroke-dashoffset do the rest.
 * Geometry math lives in lib/scoreRing.ts so it's unit-testable on its own.
 */
export default function ScoreRing({
  score,
  grade,
  size,
  strokeWidth,
  label,
  showCaption,
  scoreFontSize,
  className,
}: ScoreRingProps) {
  const { center, radius, circumference, dashoffset } = computeRingGeometry(size, strokeWidth, score);
  const isS = grade === "s";
  const isCal = grade === "cal";
  const fontSize = scoreFontSize ?? Math.round(size * 0.36);
  const caption = isCal ? "Calibrating" : gradeLabel(grade);

  return (
    <div
      className={clsx("relative inline-grid place-items-center flex-none", className)}
      style={{ width: size, height: size, ...gradeCssVars(grade) }}
      role="img"
      aria-label={`Score ${score ?? "–"}, ${caption}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
        <circle cx={center} cy={center} r={radius} strokeWidth={strokeWidth} fill="none" stroke="var(--g-dim)" />
        <circle
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          stroke="var(--g)"
          strokeLinecap="round"
          strokeDasharray={isCal ? "2 10" : circumference}
          strokeDashoffset={isCal ? undefined : dashoffset}
          className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
          style={isS ? { filter: "drop-shadow(0 0 10px rgba(255,201,60,.55))" } : undefined}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center gap-0.5">
        {label && <div className="text-label text-ink-muted">{label}</div>}
        <div
          className="font-display font-extrabold text-ink tabular-nums"
          style={{ fontSize, lineHeight: 1, letterSpacing: "-0.03em" }}
        >
          {score === null ? "–" : Math.round(score)}
        </div>
        {showCaption && <div className="text-label" style={{ color: "var(--g)" }}>{caption}</div>}
      </div>
    </div>
  );
}
