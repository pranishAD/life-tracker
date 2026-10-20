import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "../lib/clsx";

interface DisclosureProps {
  open: boolean;
  onToggle: () => void;
  title: string;
  /** Muted hint after the title, e.g. "Why this matters, start date". */
  summary?: string;
  children: ReactNode;
}

/** "More options" row that shows/hides extra fields (components.md "Disclosure").
 * It's *controlled*: the parent owns `open`, so the edit page can open it
 * by itself when the fields inside already have values. */
export default function Disclosure({ open, onToggle, title, summary, children }: DisclosureProps) {
  // useId gives a stable unique id to link the button to the panel it controls.
  const panelId = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 py-4 border-t border-border text-left focus-visible:shadow-focus focus-visible:outline-none"
      >
        <span>
          <span className="text-body font-semibold text-ink">{title}</span>
          {summary && <small className="text-body-sm text-ink-muted"> · {summary}</small>}
        </span>
        <ChevronDown className={clsx("w-5 h-5 flex-none text-ink-muted transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open && (
        <div id={panelId} className="flex flex-col gap-5 pb-2">
          {children}
        </div>
      )}
    </div>
  );
}
