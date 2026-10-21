import type { ReactNode } from "react";

interface FieldProps {
  label: ReactNode;
  /** Small muted note on the right of the label ("optional"). */
  hint?: string;
  /** id of the control, so clicking the label focuses it. */
  htmlFor?: string;
  error?: string;
  help?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Label row + control + help/error line, laid out like `.fld` in the screens. */
export default function Field({ label, hint, htmlFor, error, help, children, className }: FieldProps) {
  return (
    <div className={"flex flex-col gap-2 min-w-0 " + (className ?? "")}>
      <div className="flex justify-between gap-2 text-body-sm font-medium text-ink-muted">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
        {hint && <em className="not-italic text-ink-subtle font-normal">{hint}</em>}
      </div>
      {children}
      {error ? (
        <p className="text-body-sm text-grade-d" role="alert">
          {error}
        </p>
      ) : (
        help && <div className="text-body-sm text-ink-muted flex gap-1.5 items-start">{help}</div>
      )}
    </div>
  );
}
