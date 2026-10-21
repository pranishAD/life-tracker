// dnd-kit hands each sortable row one bag of event listeners. We want the
// mouse + keyboard ones on the grip handle (desktop) and the touch one on the
// whole row (mobile long-press), so this splits them into typed handlers.
import type { SyntheticEvent } from "react";
import type { DraggableSyntheticListeners } from "@dnd-kit/core";

export function dragHandlers(listeners: DraggableSyntheticListeners) {
  const call = (name: string) => (e: SyntheticEvent) => listeners?.[name]?.(e);
  return {
    handle: { onMouseDown: call("onMouseDown"), onKeyDown: call("onKeyDown") },
    row: { onTouchStart: call("onTouchStart") },
  };
}
