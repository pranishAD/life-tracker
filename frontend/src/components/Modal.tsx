import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import clsx from "../lib/clsx";

interface ModalProps {
  /** Accessible name of the dialog. */
  label: string;
  onClose: () => void;
  /** Small uppercase label above the title, e.g. "Settings · Categories". */
  eyebrow?: string;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Desktop width in px (check-in = 520, category dialog = 480). */
  width?: 420 | 480 | 520;
  /** Stack above another dialog (e.g. category dialog over the emoji sheet). */
  zIndex?: "z-30" | "z-40" | "z-50";
}

const WIDTH = { 420: "md:max-w-[420px]", 480: "md:max-w-[480px]", 520: "md:max-w-modal" };

/** Shared dialog frame: centred card on desktop, bottom sheet with a grab
 * handle on mobile (same frame as the check-in modal). Esc and clicking the
 * scrim close it. */
export default function Modal({ label, onClose, eyebrow, title, children, footer, width = 520, zIndex = "z-30" }: ModalProps) {
  const ref = useRef<HTMLElement>(null);
  // Keep the latest onClose in a ref so the Esc listener (set up once) never
  // calls an out-of-date version.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // useEffect runs after the dialog is on screen: move keyboard focus into
  // it, close on Esc, and put focus back where it was when it closes.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? ref.current;
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previouslyFocused?.focus?.();
    };
    // Empty deps = only on open/close; re-running whenever the parent passes
    // a new onClose function would steal focus back to the top.
  }, []);

  return (
    <div
      className={clsx("fixed inset-0 bg-overlay backdrop-blur-sm grid place-items-end md:place-items-center md:p-6", zIndex)}
      onMouseDown={(e) => {
        // Only a press that starts on the scrim itself closes the dialog.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={clsx(
          "w-full bg-surface-1 border border-border border-b-0 md:border-b rounded-t-xl md:rounded-xl shadow-modal",
          "px-4 pt-3 pb-6 md:p-8 max-h-[94vh] overflow-y-auto outline-none",
          WIDTH[width],
        )}
      >
        <div className="w-10 h-[5px] rounded-sm bg-surface-3 mx-auto mb-4 md:hidden" />
        <div className="flex justify-between items-start gap-4 mb-3 md:mb-6">
          <div>
            {eyebrow && <p className="text-label uppercase text-ink-muted mb-1">{eyebrow}</p>}
            <h2 className="font-display text-[22px] leading-7 font-semibold">{title}</h2>
          </div>
          <button
            type="button"
            className="w-9 h-9 rounded-full bg-surface-2 grid place-items-center text-ink-muted flex-none focus-visible:shadow-focus focus-visible:outline-none"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
        {footer && <div className="mt-5 md:mt-6">{footer}</div>}
      </section>
    </div>
  );
}
