import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import clsx from "../lib/clsx";

interface FieldWrapperProps {
  label: string;
  error?: string;
  help?: string;
  children: React.ReactNode;
}

/** Label + control + helper/error text, per design/components.md "Input". */
function FieldWrapper({ label, error, help, children }: FieldWrapperProps) {
  return (
    <label className="flex flex-col gap-2 w-full">
      <span className="text-body-sm font-medium text-ink-muted">{label}</span>
      {children}
      {error?.trim() ? (
        <span className="text-body-sm text-grade-d">{error}</span>
      ) : help ? (
        <span className="text-body-sm text-ink-muted">{help}</span>
      ) : null}
    </label>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  help?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, help, className, ...rest },
  ref,
) {
  return (
    <FieldWrapper label={label} error={error} help={help}>
      <input
        ref={ref}
        className={clsx(
          "bg-surface-2 border rounded-md p-3 text-body placeholder:text-ink-subtle outline-none",
          "focus:border-gold focus:shadow-focus",
          error ? "border-grade-d" : "border-border-strong",
          className,
        )}
        {...rest}
      />
    </FieldWrapper>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  help?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, help, className, ...rest },
  ref,
) {
  return (
    <FieldWrapper label={label} error={error} help={help}>
      <textarea
        ref={ref}
        className={clsx(
          "bg-surface-2 border rounded-md p-3 text-body placeholder:text-ink-subtle outline-none resize-none min-h-[64px] md:min-h-[84px]",
          "focus:border-gold focus:shadow-focus",
          error ? "border-grade-d" : "border-border-strong",
          className,
        )}
        {...rest}
      />
    </FieldWrapper>
  );
});
