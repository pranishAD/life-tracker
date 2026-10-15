// Small date helpers shared by pages. All dates the API sends are plain
// "YYYY-MM-DD" strings (no time, no timezone) — we parse them as local dates
// throughout so "today" always matches the user's calendar day.

export function todayIso(): string {
  return toIso(new Date());
}

export function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse "YYYY-MM-DD" as a local date (avoids the UTC-shift bug of `new Date("YYYY-MM-DD")`). */
export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const date = parseIso(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

/** Monday of the week containing `iso` (or today, if omitted). */
export function mondayOf(iso: string = todayIso()): string {
  const date = parseIso(iso);
  const day = date.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  return toIso(date);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

export function formatShort(iso: string): string {
  const d = parseIso(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function formatWeekday(iso: string): string {
  const d = parseIso(iso);
  return WEEKDAYS[d.getDay()];
}

export function formatFullDate(iso: string): string {
  return `${formatWeekday(iso)}, ${formatShort(iso)}`;
}

/** "Oct 5 – Oct 11" for a Monday-starting week. */
export function formatWeekRange(weekStart: string): string {
  const end = addDays(weekStart, 6);
  return `${formatShort(weekStart)} – ${formatShort(end)}`;
}

/** "Oct 5 – 11" (shorter, used in the week-switcher button). */
export function formatWeekRangeShort(weekStart: string): string {
  const end = parseIso(addDays(weekStart, 6));
  return `${formatShort(weekStart)} – ${end.getDate()}`;
}

export function daysBetween(fromIso: string, toIsoStr: string): number {
  const ms = parseIso(toIsoStr).getTime() - parseIso(fromIso).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function isPast(iso: string): boolean {
  return daysBetween(todayIso(), iso) < 0;
}
