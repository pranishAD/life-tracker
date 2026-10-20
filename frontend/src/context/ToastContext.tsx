// Minimal toast system: `showToast("message")` from any component, rendered
// once at the app root. Optionally with one action button, e.g.
// `showToast("Category deleted.", { action: { label: "Undo", onClick } })`.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  action?: ToastAction;
  /** How long it stays up, ms (default 3000; 5000 when there's an action). */
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; action?: ToastAction } | null>(null);
  // useRef holds the timer id between renders without causing re-renders.
  const timer = useRef<number | undefined>(undefined);

  const showToast = useCallback((message: string, options?: ToastOptions) => {
    window.clearTimeout(timer.current);
    setToast({ message, action: options?.action });
    const ms = options?.durationMs ?? (options?.action ? 5000 : 3000);
    timer.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          role="status"
          className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-surface-3 text-ink text-body-sm rounded-md px-4 py-3 shadow-modal flex items-center gap-4"
        >
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="font-semibold text-gold focus-visible:shadow-focus focus-visible:outline-none rounded-sm"
              onClick={() => {
                window.clearTimeout(timer.current);
                setToast(null);
                toast.action!.onClick();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
