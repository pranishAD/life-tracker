import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import clsx from "../lib/clsx";

interface FocusedTopBarProps {
  /** Back/cancel control (use <BackButton/>). */
  left: ReactNode;
  /** Step dots / title in the middle. */
  center?: ReactNode;
  /** Primary actions — desktop only; on mobile they move to a fixed footer. */
  right?: ReactNode;
}

/** Sticky 3-column top bar for the focused goal pages (no sidebar / tab bar),
 * per components.md "Create and edit goals". */
export default function FocusedTopBar({ left, center, right }: FocusedTopBarProps) {
  return (
    <header className="sticky top-0 z-20 grid grid-cols-[auto_1fr_auto] md:grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3 md:px-12 md:py-4 bg-bg/90 backdrop-blur border-b border-border">
      <div>{left}</div>
      <div className="flex justify-center">{center}</div>
      <div className="justify-self-end hidden md:flex gap-2 items-center">{right}</div>
    </header>
  );
}

export function BackButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-body-sm text-ink-muted hover:text-ink rounded-sm focus-visible:shadow-focus focus-visible:outline-none"
    >
      <ChevronLeft className="w-4 h-4" strokeWidth={2} />
      {children}
    </button>
  );
}

/** "▬ ▬ Step 2 of 2 · Details" (text hidden on mobile). */
export function StepDots({ step, total, text }: { step: number; total: number; text: string }) {
  return (
    <div className="flex items-center gap-2 text-body-sm font-semibold text-ink-muted">
      <span className="sr-only md:hidden">{text}</span>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} aria-hidden="true" className={clsx("w-6 h-1 rounded-sm", i < step ? "bg-gold" : "bg-surface-3")} />
      ))}
      <span className="hidden md:inline">{text}</span>
    </div>
  );
}

/** Mobile-only fixed footer holding the page's primary button. */
export function MobileFooter({ children }: { children: ReactNode }) {
  return (
    <div className="md:hidden fixed left-0 right-0 bottom-0 z-20 px-4 pt-3 pb-5 bg-surface-1/95 backdrop-blur border-t border-border">
      {children}
    </div>
  );
}
