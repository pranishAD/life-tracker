import type { JournalTagCount } from "../../api/types";
import clsx from "../../lib/clsx";
import Card from "../Card";

/** Right-rail "Tags" card: every tag with its count; clicking one filters the list. */
export default function JournalTagsCard({
  tags,
  activeTag,
  onSelect,
}: {
  tags: JournalTagCount[];
  activeTag: string;
  onSelect: (tag: string) => void;
}) {
  return (
    <Card className="md:p-5">
      <h2 className="text-heading-md mb-3">Tags</h2>
      {tags.length === 0 ? (
        <p className="text-body-sm text-ink-muted">No tags yet. Add some in the editor.</p>
      ) : (
        <ul className="flex flex-col -mx-2">
          {tags.map(({ tag, count }) => (
            <li key={tag}>
              <button
                type="button"
                onClick={() => onSelect(activeTag === tag ? "" : tag)}
                aria-pressed={activeTag === tag}
                className={clsx(
                  "w-full flex justify-between items-center px-2 py-1.5 rounded-sm text-body-sm",
                  "hover:bg-surface-2 focus-visible:shadow-focus focus-visible:outline-none",
                  activeTag === tag ? "text-ink font-semibold" : "text-ink-muted",
                )}
              >
                <span>
                  <span className="text-ink-subtle">#</span>
                  {tag}
                </span>
                <span className="text-ink-subtle">{count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
