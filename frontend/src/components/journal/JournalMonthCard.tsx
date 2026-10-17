import type { JournalStats } from "../../api/types";
import { monthName } from "../../lib/journal";
import Card from "../Card";

/** Right-rail "October" card: Entries + Avg mood tiles and the month's mood
 * strip (one bar per day; height = mood x 20%; grey stub = no entry). */
export default function JournalMonthCard({ stats }: { stats: JournalStats }) {
  return (
    <Card className="md:p-5">
      <h2 className="text-heading-md">{monthName(stats.month)}</h2>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <StatTile label="Entries" value={String(stats.entry_count)} />
        <StatTile label="Avg mood" value={stats.avg_mood !== null ? stats.avg_mood.toFixed(1) : "–"} />
      </div>
      <div
        className="flex items-end gap-[3px] h-14 mt-5"
        role="img"
        aria-label={`Mood for each day of ${monthName(stats.month)}`}
      >
        {stats.days.map((d) => {
          const hasEntry = d.entry_count > 0;
          const height = hasEntry && d.avg_mood !== null ? `${Math.round(d.avg_mood * 20)}%` : "3px";
          return (
            <span
              key={d.date}
              title={d.date}
              className={"flex-1 rounded-[2px] " + (hasEntry ? "bg-gold" : "bg-border-strong")}
              style={{ height }}
            />
          );
        })}
      </div>
      <p className="text-body-sm text-ink-muted mt-3">Grey = no entry that day.</p>
    </Card>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-md p-3">
      <p className="text-label uppercase text-ink-muted">{label}</p>
      <p className="font-display text-[22px] font-bold leading-[28px] mt-1">{value}</p>
    </div>
  );
}
