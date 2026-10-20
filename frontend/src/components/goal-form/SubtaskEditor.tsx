import { useState, type KeyboardEvent } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, X } from "lucide-react";
import Field from "./Field";
import clsx from "../../lib/clsx";
import { dragHandlers } from "../../lib/dnd";
import { newSubtask, type SubtaskDraft } from "../../lib/goalForm";
import { TEXT_LIMITS } from "../../lib/limits";

interface SubtaskEditorProps {
  subtasks: SubtaskDraft[];
  onChange: (subtasks: SubtaskDraft[]) => void;
  error?: string;
}

/** Milestone subtasks: type + Enter to add, drag (or grip + arrow keys) to
 * reorder, x to remove. Drag-and-drop comes from dnd-kit: <DndContext>
 * tracks the drag, <SortableContext> knows the list order, and each row
 * calls useSortable() to get its drag handlers + position. */
export default function SubtaskEditor({ subtasks, onChange, error }: SubtaskEditorProps) {
  const [draft, setDraft] = useState("");

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // Long-press on touch so normal scrolling still works.
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function add() {
    const title = draft.trim();
    if (!title) return;
    onChange([...subtasks, newSubtask(title)]);
    setDraft("");
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = subtasks.findIndex((t) => t.key === e.active.id);
    const to = subtasks.findIndex((t) => t.key === e.over!.id);
    onChange(arrayMove(subtasks, from, to));
  }

  return (
    <Field label="Subtasks" error={error} help={subtasks.length > 1 ? "Drag to reorder." : undefined}>
      {subtasks.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={subtasks.map((t) => t.key)} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col gap-1.5" aria-label="Subtasks">
              {subtasks.map((t, i) => (
                <SubtaskRow
                  key={t.key}
                  subtask={t}
                  index={i}
                  onRename={(title) => onChange(subtasks.map((s) => (s.key === t.key ? { ...s, title } : s)))}
                  onRemove={() => onChange(subtasks.filter((s) => s.key !== t.key))}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          maxLength={TEXT_LIMITS.milestoneTitle}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
              e.preventDefault(); // don't submit the whole form
              add();
            }
          }}
          placeholder="Add a subtask and press Enter"
          aria-label="New subtask"
          className="flex-1 min-w-0 bg-surface-1 border border-border-strong rounded-md px-3 py-2.5 text-body placeholder:text-ink-subtle outline-none focus:border-gold focus:shadow-focus"
        />
        <button
          type="button"
          onClick={add}
          aria-label="Add subtask"
          className="w-11 rounded-md border border-border-strong grid place-items-center text-ink hover:bg-surface-3 focus-visible:shadow-focus focus-visible:outline-none"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
    </Field>
  );
}

function SubtaskRow({
  subtask,
  index,
  onRename,
  onRemove,
}: {
  subtask: SubtaskDraft;
  index: number;
  onRename: (title: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: subtask.key,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      // Long-press anywhere on the row to drag on touch screens.
      {...dragHandlers(listeners).row}
      className={clsx(
        "flex items-center gap-2 bg-surface-1 rounded-md pl-1 pr-1 py-1",
        isDragging && "relative z-10 shadow-modal",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...dragHandlers(listeners).handle}
        aria-label={`Reorder subtask ${index + 1}: ${subtask.title}`}
        className="w-8 h-9 grid place-items-center text-ink-subtle cursor-grab rounded-sm focus-visible:shadow-focus focus-visible:outline-none"
      >
        <GripVertical className="w-4 h-4" strokeWidth={2} />
      </button>
      <input
        value={subtask.title}
        maxLength={TEXT_LIMITS.milestoneTitle}
        onChange={(e) => onRename(e.target.value)}
        aria-label={`Subtask ${index + 1}`}
        className="flex-1 min-w-0 bg-transparent text-body outline-none rounded-sm px-1 py-1.5 focus:shadow-focus"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${subtask.title || `subtask ${index + 1}`}`}
        className="w-9 h-9 grid place-items-center text-ink-muted hover:text-ink rounded-sm focus-visible:shadow-focus focus-visible:outline-none"
      >
        <X className="w-4 h-4" strokeWidth={2} />
      </button>
    </li>
  );
}
