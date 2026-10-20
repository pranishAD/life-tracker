import { Check } from "lucide-react";
import clsx from "../lib/clsx";
import { colorLabel, ID_SOLID, IDENTITY_COLORS } from "../lib/identity";
import type { IdentityColor } from "../api/types";

interface ColourSwatchesProps {
  value: IdentityColor;
  onChange: (color: IdentityColor) => void;
}

/** The 10 identity colours as round buttons (components.md "ColourSwatches"). */
export default function ColourSwatches({ value, onChange }: ColourSwatchesProps) {
  return (
    <div className="grid grid-cols-10 gap-2" role="group" aria-label="Colour">
      {IDENTITY_COLORS.map((c) => {
        const on = c === value;
        return (
          <button
            key={c}
            type="button"
            aria-label={colorLabel(c)}
            aria-pressed={on}
            onClick={() => onChange(c)}
            className={clsx(
              "w-full max-w-[32px] aspect-square rounded-full grid place-items-center text-bg",
              "focus-visible:shadow-focus focus-visible:outline-none",
              ID_SOLID[c],
              // Selected: 2px surface-1 gap + 2px ink ring
              on && "shadow-[0_0_0_2px_#14141c,0_0_0_4px_#f4f4f7]",
            )}
          >
            {on && <Check className="w-4 h-4" strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}
