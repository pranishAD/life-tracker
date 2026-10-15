// Tiny `clsx`-alike so we can conditionally join class names without adding
// a dependency. `undefined`/`false`/`""` are skipped, everything else joined.
export default function clsx(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(" ");
}
