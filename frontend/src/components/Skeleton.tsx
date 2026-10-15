import clsx from "../lib/clsx";

/** Loading placeholder block, per components.md: "skeleton blocks in
 * bg-surface-2 at the size of each card, rings as empty tracks. No spinners
 * on the dashboard hero." */
export default function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("bg-surface-2 rounded-md animate-pulse", className)} />;
}
