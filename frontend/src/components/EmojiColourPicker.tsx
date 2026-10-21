import { useEffect, useRef, type RefObject } from "react";
import Button from "./Button";
import ColourSwatches from "./ColourSwatches";
import EmojiPicker from "./EmojiPicker";
import type { IdentityColor } from "../api/types";

interface EmojiColourPickerProps {
  emoji: string;
  color: IdentityColor;
  goalName: string;
  onEmoji: (emoji: string) => void;
  onColor: (color: IdentityColor) => void;
  onClose: () => void;
  /** The tile button that opened it: clicks on it don't count as "outside". */
  anchorRef: RefObject<HTMLElement>;
}

/** Screen 11c: colour swatches → search → emoji sections.
 * Desktop: 360px popover under the tile. Mobile: bottom sheet over a scrim.
 * Picking doesn't close it; clicking outside, Esc or Done does. */
export default function EmojiColourPicker({ emoji, color, goalName, onEmoji, onColor, onClose, anchorRef }: EmojiColourPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input")?.focus({ preventScroll: true });
    function onPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        anchorRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose, anchorRef]);

  return (
    <>
      {/* Scrim only on mobile, where this is a bottom sheet. */}
      <div className="md:hidden fixed inset-0 bg-overlay z-30" aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-label="Pick emoji and colour"
        className={
          "z-40 bg-surface-1 border border-border-strong shadow-modal flex flex-col gap-4 " +
          // mobile: bottom sheet
          "fixed left-0 right-0 bottom-0 rounded-t-xl border-b-0 px-4 pt-3 pb-6 " +
          // desktop: popover under the tile
          "md:absolute md:bottom-auto md:right-auto md:left-0 md:top-[76px] md:w-[360px] md:rounded-lg md:border-b md:p-4"
        }
      >
        <div className="w-10 h-[5px] rounded-sm bg-surface-3 mx-auto md:hidden" />
        <div>
          <p className="text-label uppercase text-ink-muted mb-2">Colour</p>
          <ColourSwatches value={color} onChange={onColor} />
        </div>
        <EmojiPicker selected={emoji} onSelect={onEmoji} goalName={goalName} maxHeight={window.innerWidth < 768 ? 300 : 232} />
        <Button size="sm" className="md:hidden justify-center" onClick={onClose}>
          Done
        </Button>
      </div>
    </>
  );
}
