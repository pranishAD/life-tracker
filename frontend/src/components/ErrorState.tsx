import Button from "./Button";

/** Shared "this card failed to load" state, per components.md: message +
 * "Try again" inside the card that failed, rest of the page stays usable. */
export default function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <p className="text-grade-d text-body-sm">{message ?? "Something went wrong."}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
