import { useEffect, useState } from "react";

/**
 * Returns `value`, but only after it has stopped changing for `delayMs`.
 * Used so search and the export preview don't fire a request per keystroke.
 *
 * How it works: every time `value` changes, the effect starts a timer and
 * the cleanup function cancels the previous one. Only the last timer
 * survives long enough to update the state.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
