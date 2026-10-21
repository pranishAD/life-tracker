// Habit schedule helpers (contract FrequencyType): daily, per_week (N times,
// any days) or weekdays (only the picked days, ISO 1 = Mon … 7 = Sun).
import type { FrequencyType, Weekday } from "../api/types";

export const WEEKDAYS: { day: Weekday; letter: string; short: string; long: string }[] = [
  { day: 1, letter: "M", short: "Mon", long: "Monday" },
  { day: 2, letter: "T", short: "Tue", long: "Tuesday" },
  { day: 3, letter: "W", short: "Wed", long: "Wednesday" },
  { day: 4, letter: "T", short: "Thu", long: "Thursday" },
  { day: 5, letter: "F", short: "Fri", long: "Friday" },
  { day: 6, letter: "S", short: "Sat", long: "Saturday" },
  { day: 7, letter: "S", short: "Sun", long: "Sunday" },
];

interface Schedule {
  frequency_type: FrequencyType | null;
  frequency_per_week: number | null;
  weekdays: Weekday[] | null;
}

/** Check-ins expected in a full week: daily 7, per_week N, weekdays = picked days. */
export function expectedPerWeek(s: Schedule): number {
  if (s.frequency_type === "daily") return 7;
  if (s.frequency_type === "weekdays") return s.weekdays?.length ?? 0;
  return s.frequency_per_week ?? 0;
}

/** "Mon, Tue, Thu" in Monday-first order. */
export function weekdayList(days: Weekday[]): string {
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAYS[d - 1].short)
    .join(", ");
}

/** Summary under the WeekdayPicker: "5 days a week · Mon, Tue, Thu, Fri, Sat". */
export function weekdaySummary(days: Weekday[]): string {
  if (days.length === 7) return "Every day of the week";
  const n = days.length;
  return `${n} day${n === 1 ? "" : "s"} a week · ${weekdayList(days)}`;
}

/** Short schedule text for cards/chips: "every day", "4 times a week", "Mon, Wed, Fri". */
export function scheduleLabel(s: Schedule): string {
  if (s.frequency_type === "daily") return "every day";
  if (s.frequency_type === "weekdays" && s.weekdays?.length) return weekdayList(s.weekdays);
  const n = s.frequency_per_week ?? 0;
  return n === 1 ? "once a week" : `${n} times a week`;
}
