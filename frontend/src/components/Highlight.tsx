/** Wraps every case-insensitive match of `query` in the gold search
 * highlight (SearchField spec). No query → plain text. */
export default function Highlight({ text, query }: { text: string; query?: string }) {
  const q = query?.trim();
  if (!q) return <>{text}</>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // split() with a capture group keeps the matches, at the odd indexes.
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-grade-s-dim text-gold rounded-sm">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
