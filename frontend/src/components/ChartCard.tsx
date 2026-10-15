import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import Button from "./Button";
import Card from "./Card";
import type { GradeKey } from "../lib/grade";
import { formatShort } from "../lib/date";

export interface ChartPoint {
  date: string;
  score: number | null;
}

interface ChartCardProps {
  title: string;
  grade: GradeKey;
  data: ChartPoint[];
  currentValue: number | null;
  deltaValue: number | null;
  deltaCaption: string;
  rangeOptions: readonly [number, number];
  range: number;
  onRangeChange: (range: number) => void;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** Dashed placeholder instead of a chart, for Calibrating goals. */
  placeholder?: string;
}

const GRADE_HEX: Record<GradeKey, string> = {
  s: "#ffc93c",
  a: "#3ddc84",
  b: "#41b6ff",
  c: "#ff9f43",
  d: "#ff4d5e",
  cal: "#8a8aa0",
};

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as ChartPoint;
  return (
    <div className="bg-surface-3 rounded-sm px-3 py-2 text-body-sm">
      <div className="text-ink-muted">{formatShort(point.date)}</div>
      <div className="text-ink font-semibold">{point.score ?? "–"}</div>
    </div>
  );
}

/** Score trend / score history card: header with range toggle + Recharts area chart.
 * Grid lines sit at the grade thresholds (40/60/75/90) per components.md. */
export default function ChartCard({
  title,
  grade,
  data,
  currentValue,
  deltaValue,
  deltaCaption,
  rangeOptions,
  range,
  onRangeChange,
  isLoading,
  isError,
  onRetry,
  placeholder,
}: ChartCardProps) {
  const color = GRADE_HEX[grade];
  const isUp = (deltaValue ?? 0) >= 0;

  return (
    <Card grade={grade}>
      <div className="flex justify-between items-start mb-1">
        <div>
          <p className="text-label text-ink-muted mb-1">{title}</p>
          {currentValue !== null && (
            <div className="font-display text-[28px] font-bold leading-8 text-ink">
              {currentValue}{" "}
              {deltaValue !== null && (
                <span className={clsxDelta(isUp)}>
                  {isUp ? "▲" : "▼"} {Math.abs(deltaValue)} {deltaCaption}
                </span>
              )}
            </div>
          )}
        </div>
        {!placeholder && (
          <div className="flex gap-1 flex-none">
            {rangeOptions.map((r) => (
              <Button
                key={r}
                size="sm"
                variant={r === range ? "secondary" : "ghost"}
                onClick={() => onRangeChange(r)}
              >
                {r}D
              </Button>
            ))}
          </div>
        )}
      </div>

      {placeholder ? (
        <div className="h-[140px] rounded-md border border-dashed border-border-strong grid place-items-center text-ink-muted text-body-sm text-center px-4 mt-2">
          {placeholder}
        </div>
      ) : isError ? (
        <div className="h-[140px] grid place-items-center gap-3">
          <p className="text-grade-d text-body-sm">Couldn't load this chart.</p>
          {onRetry && (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      ) : isLoading ? (
        <div className="h-[140px] rounded-md bg-surface-2 animate-pulse mt-2" />
      ) : data.length === 0 ? (
        <div className="h-[140px] grid place-items-center text-ink-muted text-body-sm">
          Not enough data yet.
        </div>
      ) : (
        <div className="h-[160px] mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 28, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`fill-${grade}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              {[40, 60, 75, 90].map((v) => (
                <ReferenceLine
                  key={v}
                  y={v}
                  stroke="#23232f"
                  label={{ value: String(v), position: "right", fill: "#a3a3b5", fontSize: 11 }}
                />
              ))}
              <XAxis dataKey="date" hide />
              <YAxis domain={[0, 100]} hide />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="score"
                stroke={color}
                strokeWidth={2.5}
                fill={`url(#fill-${grade})`}
                dot={(props: { cx?: number; cy?: number; index?: number }) => {
                  const isLast = props.index === data.length - 1;
                  if (!isLast || props.cx === undefined || props.cy === undefined) {
                    return <circle key={props.index} r={0} />;
                  }
                  return (
                    <circle
                      key={props.index}
                      cx={props.cx}
                      cy={props.cy}
                      r={5}
                      fill={color}
                      stroke="#14141c"
                      strokeWidth={3}
                    />
                  );
                }}
                connectNulls
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function clsxDelta(isUp: boolean) {
  return isUp ? "text-grade-a font-semibold" : "text-grade-d font-semibold";
}
