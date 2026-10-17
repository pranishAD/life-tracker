import type { ReactNode } from "react";
import { X } from "lucide-react";
import clsx from "../lib/clsx";

interface TagChipProps {
  tag: string;
  /** Custom rendering of the tag text (e.g. with search highlight). */
  children?: ReactNode;
  count?: number;
  /** Filter chip: renders a button; `selected` = `bg-ink text-bg`. */
  onClick?: () => void;
  selected?: boolean;
  /** Editor chip: adds the x button. */
  onRemove?: () => void;
  /** Hide the "#" (the "All" filter chip). */
  hideHash?: boolean;
}

/** Journal tag chip (`#study`). Not the uppercase goal category chip. */
export default function TagChip({ tag, children, count, onClick, selected, onRemove, hideHash }: TagChipProps) {
  const content = (
    <>
      {!hideHash && <span className={selected ? "opacity-60" : "text-ink-subtle"}>#</span>}
      {children ?? tag}
      {count !== undefined && <span className="opacity-70 ml-1.5">{count}</span>}
    </>
  );

  if (onRemove) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 text-ink pl-2.5 pr-1.5 py-0.5 text-body-sm font-medium">
        <span>{content}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${tag}`}
          className="w-4 h-4 grid place-items-center rounded-full text-ink-muted hover:text-ink focus-visible:shadow-focus focus-visible:outline-none"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </span>
    );
  }

  const base = "inline-flex items-center flex-none rounded-full text-body-sm font-medium";
  const colours = selected ? "bg-ink text-bg" : "bg-surface-2 text-ink-muted";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={clsx(
          base,
          colours,
          "px-3 py-1.5 transition focus-visible:shadow-focus focus-visible:outline-none",
          !selected && "hover:text-ink",
        )}
      >
        {content}
      </button>
    );
  }
  return <span className={clsx(base, colours, "px-2.5 py-0.5")}>{content}</span>;
}
