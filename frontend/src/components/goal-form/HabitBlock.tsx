import Field from "./Field";
import SegmentedControl from "../SegmentedControl";
import Stepper from "../Stepper";
import WeekdayPicker from "../WeekdayPicker";
import { TIMES_PER_WEEK_MAX, type FormErrors, type GoalFormState } from "../../lib/goalForm";
import { weekdaySummary } from "../../lib/frequency";
import type { FrequencyType } from "../../api/types";

interface HabitBlockProps {
  form: GoalFormState;
  update: (patch: Partial<GoalFormState>) => void;
  errors: FormErrors;
  /** A legacy goal may already have more than 7 a week; let the stepper reach it. */
  stepperMax?: number;
}

/** "How often?" Every day / Per week / Pick days (screen 11b). */
export default function HabitBlock({ form, update, errors, stepperMax = TIMES_PER_WEEK_MAX }: HabitBlockProps) {
  return (
    <>
      <Field label="How often?">
        <SegmentedControl<FrequencyType>
          label="Frequency"
          onSurface2
          value={form.frequencyType}
          onChange={(v) => update({ frequencyType: v })}
          options={[
            { value: "daily", label: "Every day" },
            { value: "per_week", label: "Per week" },
            { value: "weekdays", label: "Pick days" },
          ]}
        />
      </Field>

      {form.frequencyType === "per_week" && (
        <Field label="Times a week" error={errors.timesPerWeek}>
          <div className="flex items-center gap-3">
            <Stepper
              label="Times a week"
              value={form.timesPerWeek}
              min={1}
              max={Math.max(stepperMax, TIMES_PER_WEEK_MAX)}
              onChange={(n) => update({ timesPerWeek: n })}
            />
            <span className="text-body text-ink-muted">times a week</span>
          </div>
        </Field>
      )}

      {form.frequencyType === "weekdays" && (
        <Field label="Which days?" error={errors.weekdays}>
          <WeekdayPicker value={form.weekdays} onChange={(days) => update({ weekdays: days })} />
          <p className="text-body-sm text-ink">{weekdaySummary(form.weekdays)}</p>
        </Field>
      )}
    </>
  );
}
