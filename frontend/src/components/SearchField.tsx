import { forwardRef, type InputHTMLAttributes } from "react";
import { Search } from "lucide-react";
import clsx from "../lib/clsx";

interface SearchFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Show the "/" shortcut hint (desktop only). */
  showShortcut?: boolean;
}

/** Search box per design/components.md "SearchField". `forwardRef` lets the
 * parent hold a ref to the real <input>, so the "/" shortcut can focus it. */
const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { showShortcut = true, className, ...rest },
  ref,
) {
  return (
    <label
      className={clsx(
        "h-11 flex items-center gap-2 bg-surface-1 border border-border-strong rounded-md px-3 transition",
        "focus-within:border-gold focus-within:shadow-focus",
        className,
      )}
    >
      <Search className="w-4 h-4 text-ink-muted flex-none" aria-hidden />
      <input
        ref={ref}
        type="search"
        className="flex-1 min-w-0 bg-transparent text-body text-ink placeholder:text-ink-subtle outline-none [&::-webkit-search-cancel-button]:hidden"
        {...rest}
      />
      {showShortcut && (
        <kbd className="hidden md:inline-grid place-items-center min-w-[22px] h-[22px] px-1 rounded-sm border border-border-strong text-[11px] font-semibold text-ink-subtle font-sans">
          /
        </kbd>
      )}
    </label>
  );
});

export default SearchField;
