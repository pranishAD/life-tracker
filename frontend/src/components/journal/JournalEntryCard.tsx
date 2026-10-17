import { Link } from "react-router-dom";
import type { JournalEntry } from "../../api/types";
import clsx from "../../lib/clsx";
import { entryDisplay, formatTime } from "../../lib/journal";
import Highlight from "../Highlight";
import MoodMeter from "../MoodMeter";
import TagChip from "../TagChip";

/** One entry in the Journal list (screen 7). The whole card links to the editor.
 * Desktop: date tile | text. Mobile: no tile, a "SAT, OCT 17" label above the title. */
export default function JournalEntryCard({ entry, query }: { entry: JournalEntry; query?: string }) {
  const created = new Date(entry.created_at);
  const { title, excerpt, untitled } = entryDisplay(entry);
  const weekday = created.toLocaleDateString("en-US", { weekday: "short" });
  const mobileDate = created.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <Link
      to={`/journal/${entry.id}`}
      className={clsx(
        "block bg-surface-1 border border-border rounded-lg p-4 md:p-5 transition",
        "hover:bg-surface-2 hover:border-border-strong focus-visible:shadow-focus focus-visible:outline-none",
        "md:grid md:grid-cols-[56px_1fr] md:gap-4",
      )}
    >
      <div className="hidden md:block text-center bg-surface-2 rounded-md py-1.5 self-start" aria-hidden>
        <b className="block font-display text-[18px] leading-[22px]">{String(created.getDate()).padStart(2, "0")}</b>
        <span className="text-[11px] font-semibold uppercase text-ink-muted tracking-wide">
          {created.toLocaleDateString("en-US", { month: "short" })}
        </span>
      </div>

      <div className="min-w-0">
        <p className="md:hidden text-label uppercase text-ink-muted mb-1">{mobileDate}</p>
        <h3 className={clsx("text-heading-md truncate", untitled && "font-medium")}>
          <Highlight text={title} query={query} />
        </h3>
        {excerpt && (
          <p className="text-body text-ink-muted mt-1 line-clamp-2">
            <Highlight text={excerpt} query={query} />
          </p>
        )}
        <div className="flex items-center gap-3 mt-3 min-w-0">
          <MoodMeter mood={entry.mood} />
          {entry.tags.length > 0 && (
            <div className="flex gap-1.5 min-w-0 overflow-hidden">
              {entry.tags.map((t) => (
                <TagChip key={t} tag={t}>
                  <Highlight text={t} query={query} />
                </TagChip>
              ))}
            </div>
          )}
          <span className="ml-auto flex-none text-body-sm text-ink-subtle">
            {weekday} {formatTime(created)}
          </span>
        </div>
      </div>
    </Link>
  );
}
