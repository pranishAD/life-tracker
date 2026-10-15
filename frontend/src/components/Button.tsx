import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "../lib/clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-gold text-ink-on-gold hover:bg-gold-hover",
  secondary: "border border-border-strong text-ink hover:bg-surface-2",
  ghost: "text-ink-muted hover:text-ink hover:bg-surface-2",
  danger: "bg-grade-d-dim text-grade-d",
};

const SIZE_CLASSES: Record<Size, string> = {
  md: "rounded-md px-5 py-3 text-body",
  sm: "rounded-sm px-3 py-2 text-body-sm",
};

/** Base button per design/components.md "Button". `icon` goes before children. */
export default function Button({
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "font-semibold inline-flex items-center gap-2 transition active:scale-[.97]",
        "focus-visible:shadow-focus focus-visible:outline-none",
        SIZE_CLASSES[size],
        disabled ? "bg-surface-2 text-ink-subtle cursor-not-allowed" : VARIANT_CLASSES[variant],
        className,
      )}
      disabled={disabled}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
