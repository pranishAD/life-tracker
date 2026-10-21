import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import clsx from "../lib/clsx";
import type { CategoryRef } from "../api/types";

interface CategoryChipProps {
  category: Pick<CategoryRef, "name" | "emoji">;
  /** Selected state in pickers and filters (`bg-ink text-bg`). */
  selected?: boolean;
  /** "sm" = inside goal cards; "md" = default; "lg" = goal-form picker / filters. */
  size?: "sm" | "md" | "lg";
  /** Extra content after the name, e.g. a count in the Goals filter row. */
  suffix?: ReactNode;
  onClick?: () => void;
  className?: string;
}

const SIZE = {
  sm: "text-[12px] leading-4 pl-[5px] pr-2 py-px gap-1",
  md: "text-body-sm pl-1.5 pr-2.5 py-0.5 gap-1.5",
  lg: "text-[14px] leading-[18px] pl-2 pr-3 py-[7px] gap-1.5",
};

/** Pill with a category's emoji + name (components.md "CategoryChip").
 * Renders a <button> with aria-pressed when clickable (pickers/filters). */
export default function CategoryChip({ category, selected, size = "md", suffix, onClick, className }: CategoryChipProps) {
  const classes = clsx(
    "inline-flex items-center rounded-full font-medium whitespace-nowrap flex-none min-w-0",
    SIZE[size],
    selected ? "bg-ink text-bg" : "bg-surface-2 text-ink-muted",
    onClick && "focus-visible:shadow-focus focus-visible:outline-none transition-colors",
    onClick && !selected && "hover:text-ink",
    className,
  );
  const content = (
    <>
      {category.emoji && (
        <span aria-hidden="true" className={clsx("font-emoji leading-none", size === "sm" ? "text-[12px]" : "text-[13px]")}>
          {category.emoji}
        </span>
      )}
      <span className="truncate">{category.name}</span>
      {suffix}
    </>
  );
  if (!onClick) return <span className={classes}>{content}</span>;
  return (
    <button type="button" className={classes} aria-pressed={!!selected} onClick={onClick}>
      {content}
    </button>
  );
}

/** Dashed "+ New category" chip. */
export function AddCategoryChip({ onClick, disabled, title }: { onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border border-dashed border-border-strong px-3 py-[7px]",
        "text-[14px] leading-[18px] font-medium text-ink-muted whitespace-nowrap flex-none",
        "focus-visible:shadow-focus focus-visible:outline-none",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:text-ink",
      )}
    >
      <Plus className="w-4 h-4" strokeWidth={2} />
      New category
    </button>
  );
}
