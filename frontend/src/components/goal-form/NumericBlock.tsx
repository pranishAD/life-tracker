import { ArrowRight, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import Field from "./Field";
import SegmentedControl from "../SegmentedControl";
import clsx from "../../lib/clsx";
import { autoDirection, effectiveDirection, parseNum, type FormErrors, type GoalFormState } from "../../lib/goalForm";
import { formatNum } from "../../lib/progress";
import { TEXT_LIMITS } from "../../lib/limits";
import type { NumericDirection } from "../../api/types";

interface NumericBlockProps {
  form: GoalFormState;
  update: (patch: Partial<GoalFormState>) => void;
  errors: FormErrors;
  /** Latest logged value (edit mode), for "x to go". */
  currentValue?: number | null;
}

/** Start / target / unit + direction (screen 11, numeric type block). */
export default function NumericBlock({ form, update, errors, currentValue }: NumericBlockProps) {
  const auto = autoDirection(form.startValue, form.targetValue);
  const direction = effectiveDirection(form);
  const start = parseNum(form.startValue) ?? 0;
  const target = parseNum(form.targetValue);
  const unit = form.unit.trim();
  const from = currentValue ?? start;
  const withUnit = (n: number) => `${formatNum(n)}${unit ? ` ${unit}` : ""}`;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Field label="Start value" htmlFor="goal-start" error={errors.startValue}>
          <AffixInput
            id="goal-start"
            value={form.startValue}
            placeholder="0"
            suffix={unit}
            invalid={!!errors.startValue}
            onChange={(v) => update({ startValue: v })}
          />
        </Field>
        <Field label="Target value" htmlFor="goal-target" error={errors.targetValue}>
          <AffixInput
            id="goal-target"
            value={form.targetValue}
            placeholder="80"
            suffix={unit}
            invalid={!!errors.targetValue}
            onChange={(v) => update({ targetValue: v })}
          />
        </Field>
        <Field label="Unit" htmlFor="goal-unit" error={errors.unit} className="col-span-2 md:col-span-1">
          <input
            id="goal-unit"
            value={form.unit}
            maxLength={TEXT_LIMITS.goalUnit}
            placeholder="kg, min, km, pages, Rs"
            onChange={(e) => update({ unit: e.target.value })}
            className="h-12 bg-surface-1 border border-border-strong rounded-md px-3 text-body placeholder:text-ink-subtle outline-none focus:border-gold focus:shadow-focus"
          />
        </Field>
      </div>

      <Field
        label="Direction"
        error={errors.direction}
        help={
          !form.directionTouched && auto ? (
            <>
              <Sparkles className="w-4 h-4 text-gold flex-none mt-px" strokeWidth={2} />
              <span>
                Set automatically: your target is {auto === "decrease" ? "lower" : "higher"} than your start, so{" "}
                {auto === "decrease" ? "lower" : "higher"} is better.
              </span>
            </>
          ) : undefined
        }
      >
        <SegmentedControl<NumericDirection>
          label="Direction"
          onSurface2
          value={direction}
          onChange={(d) => update({ direction: d, directionTouched: true })}
          options={[
            { value: "increase", label: "Increase", icon: <TrendingUp className="w-4 h-4" strokeWidth={2} /> },
            { value: "decrease", label: "Decrease", icon: <TrendingDown className="w-4 h-4" strokeWidth={2} /> },
          ]}
        />
      </Field>

      {target !== null && target !== start && !errors.direction && (
        <div
          className="flex items-center gap-3 text-body-sm text-ink-muted rounded-md px-3 py-2.5"
          aria-label={`Progress runs from ${withUnit(start)} to ${withUnit(target)}`}
        >
          <b className="font-display font-bold text-[15px] leading-5 text-ink whitespace-nowrap">{withUnit(start)}</b>
          <ArrowRight className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
          <b className="font-display font-bold text-[15px] leading-5 text-ink whitespace-nowrap">{withUnit(target)}</b>
          <span className="ml-auto text-right">{toGo(from, target, direction, withUnit)}</span>
        </div>
      )}
    </>
  );
}

function toGo(from: number, target: number, direction: NumericDirection, fmt: (n: number) => string): string {
  const left = direction === "increase" ? target - from : from - target;
  if (left <= 0) return "Target reached";
  return `${fmt(left)} to go`;
}

interface AffixInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  placeholder?: string;
  invalid?: boolean;
}

/** Number input with the unit as a suffix (Unbounded 20px digits). */
function AffixInput({ id, value, onChange, suffix, placeholder, invalid }: AffixInputProps) {
  return (
    <div
      className={clsx(
        "flex items-center bg-surface-1 border rounded-md focus-within:border-gold focus-within:shadow-focus",
        invalid ? "border-grade-d" : "border-border-strong",
      )}
    >
      <input
        id={id}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 bg-transparent outline-none font-display font-bold text-[20px] leading-6 px-3 py-[11px] tabular-nums placeholder:text-ink-subtle"
      />
      {suffix && <span className="pr-3 text-body-sm font-medium text-ink-muted">{suffix}</span>}
    </div>
  );
}
