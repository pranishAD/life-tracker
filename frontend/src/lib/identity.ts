// Goal / category identity: the user-picked emoji + colour.
// Identity colours ONLY tint emoji tiles, category chips, dots and swatches
// (design/components.md "Global rules"). Rings, bars, charts and grade text
// always use the grade colour instead.
import type { CategoryRef, Goal, IdentityColor } from "../api/types";

/** Display order of the swatches (design/tokens.json color.identity). */
export const IDENTITY_COLORS: IdentityColor[] = [
  "slate",
  "violet",
  "purple",
  "pink",
  "rose",
  "sand",
  "lime",
  "teal",
  "cyan",
  "indigo",
];

// Tailwind only generates classes it can find as complete strings in the
// source, so we can't build `bg-id-${color}/[.22]` at runtime. Instead we
// list every variant here once and look it up by colour.
/** EmojiTile tint: colour at 22% + 1px inset ring at 40%. */
export const ID_TILE: Record<IdentityColor, string> = {
  slate: "bg-id-slate/[.22] ring-1 ring-inset ring-id-slate/40",
  violet: "bg-id-violet/[.22] ring-1 ring-inset ring-id-violet/40",
  purple: "bg-id-purple/[.22] ring-1 ring-inset ring-id-purple/40",
  pink: "bg-id-pink/[.22] ring-1 ring-inset ring-id-pink/40",
  rose: "bg-id-rose/[.22] ring-1 ring-inset ring-id-rose/40",
  sand: "bg-id-sand/[.22] ring-1 ring-inset ring-id-sand/40",
  lime: "bg-id-lime/[.22] ring-1 ring-inset ring-id-lime/40",
  teal: "bg-id-teal/[.22] ring-1 ring-inset ring-id-teal/40",
  cyan: "bg-id-cyan/[.22] ring-1 ring-inset ring-id-cyan/40",
  indigo: "bg-id-indigo/[.22] ring-1 ring-inset ring-id-indigo/40",
};

/** Solid colour (swatches, dots). Safelisted in tailwind.config.js. */
export const ID_SOLID: Record<IdentityColor, string> = {
  slate: "bg-id-slate",
  violet: "bg-id-violet",
  purple: "bg-id-purple",
  pink: "bg-id-pink",
  rose: "bg-id-rose",
  sand: "bg-id-sand",
  lime: "bg-id-lime",
  teal: "bg-id-teal",
  cyan: "bg-id-cyan",
  indigo: "bg-id-indigo",
};

export function colorLabel(color: IdentityColor): string {
  return color[0].toUpperCase() + color.slice(1);
}

/** What a goal actually shows: its own emoji/colour, or its category's. */
export function goalIdentity(
  goal: Pick<Goal, "emoji" | "color"> & { category: CategoryRef },
): { emoji: string; color: IdentityColor } {
  return {
    emoji: goal.emoji ?? goal.category.emoji,
    color: goal.color ?? goal.category.color,
  };
}

/** Max characters for a category name (contract CategoryCreateRequest). */
export const CATEGORY_NAME_MAX = 24;
