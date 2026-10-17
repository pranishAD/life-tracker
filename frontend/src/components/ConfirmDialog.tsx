import { useEffect, useRef } from "react";
import Button from "./Button";

interface ConfirmDialogProps {
  title: string;
  message?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** Button text while `busy` (default "Working…"). */
  busyLabel?: string;
  error?: string | null;
  /** Danger styling for destructive actions (delete). */
  destructive?: boolean;
}

/** Small centred confirm dialog, same frame as the other modals. */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
  busyLabel = "Working…",
  error,
  destructive,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);

  // Focus "Cancel" when it opens (so a stray Enter never deletes), and let
  // Esc close it. The listener is on the capture phase so the editor's own
  // Esc-to-go-back shortcut doesn't also fire.
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-40 bg-overlay backdrop-blur-sm grid place-items-center p-4" onClick={onCancel}>
      <section
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-[420px] bg-surface-1 border border-border rounded-xl shadow-modal p-6 md:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-heading-lg">{title}</h2>
        {message && <p className="text-body text-ink-muted mt-2">{message}</p>}
        {error && <p className="text-body-sm text-grade-d mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-6">
          <Button data-cancel variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
