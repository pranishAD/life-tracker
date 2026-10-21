import clsx from "../lib/clsx";
import { ID_TILE } from "../lib/identity";
import type { IdentityColor } from "../api/types";

type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, string> = {
  sm: "w-7 h-7 rounded-sm text-[15px]",
  md: "w-10 h-10 rounded-md text-[22px]",
  // 64px on desktop, 56px on mobile (components.md "EmojiTile")
  lg: "w-14 h-14 text-[30px] md:w-16 md:h-16 md:text-[34px] rounded-lg",
};

interface EmojiTileProps {
  emoji: string;
  color: IdentityColor;
  size?: Size;
  className?: string;
}

/** Square tile with the goal's / category's emoji, tinted with its identity
 * colour (22% fill + 40% inset ring). Decorative: the emoji is hidden from
 * screen readers because the name next to it already says what it is. */
export default function EmojiTile({ emoji, color, size = "md", className }: EmojiTileProps) {
  return (
    <span
      className={clsx(
        "relative flex-none inline-grid place-items-center font-emoji leading-none",
        SIZE[size],
        ID_TILE[color],
        className,
      )}
      data-id={color}
    >
      <span aria-hidden="true">{emoji}</span>
    </span>
  );
}
