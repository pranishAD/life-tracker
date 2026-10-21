import { useEffect, useRef, useState } from "react";
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
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Info, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Button from "../Button";
import Card from "../Card";
import CategoryChip from "../CategoryChip";
import CategoryDialog from "../CategoryDialog";
import EmojiTile from "../EmojiTile";
import ErrorState from "../ErrorState";
import Modal from "../Modal";
import Skeleton from "../Skeleton";
import clsx from "../../lib/clsx";
import { dragHandlers } from "../../lib/dnd";
import { useToast } from "../../context/ToastContext";
import {
  MAX_CATEGORIES,
  moveId,
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useReorderCategories,
} from "../../hooks/useCategories";
import type { Category } from "../../api/types";

/** Settings › Categories (screen 12): list, drag to reorder, new / edit /
 * delete. Order here = order on the dashboard, filters and pickers. */
export default function CategoriesSettings() {
  const { data: categories, isLoading, isError, refetch } = useCategories();
  const reorder = useReorderCategories();
  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();
  const { showToast } = useToast();

  const [dialog, setDialog] = useState<{ category?: Category } | null>(null);
  const [toDelete, setToDelete] = useState<Category | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // Mobile: long-press a row to drag it (a quick swipe still scrolls).
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const atLimit = (categories?.length ?? 0) >= MAX_CATEGORIES;

  function onDragEnd(e: DragEndEvent) {
    if (!categories || !e.over) return;
    const ids = categories.map((c) => c.id);
    const next = moveId(ids, String(e.active.id), String(e.over.id));
    if (next === ids) return;
    reorder.mutate(next, {
      onError: (err) => showToast(err instanceof Error ? err.message : "Couldn't save the new order."),
    });
  }

  async function deleteEmpty(category: Category) {
    const previousOrder = categories?.map((c) => c.id) ?? [];
    try {
      await deleteCategory.mutateAsync({ id: category.id });
      showToast(`Deleted "${category.name}".`, {
        action: { label: "Undo", onClick: () => undoDelete(category, previousOrder) },
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't delete that category.");
    }
  }

  /** Undo = create the same category again, then put it back in its old spot. */
  async function undoDelete(category: Category, previousOrder: string[]) {
    try {
      const restored = await createCategory.mutateAsync({ name: category.name, emoji: category.emoji, color: category.color });
      const order = previousOrder.map((id) => (id === category.id ? restored.id : id));
      await reorder.mutateAsync(order);
      showToast(`Restored "${category.name}".`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't bring that category back.");
    }
  }

  return (
    <div className="max-w-[820px]">
      <Card className="p-4 md:p-6">
        <div className="flex justify-between items-start gap-4 mb-2">
          <div>
            <h2 className="font-display text-[17px] leading-6 font-semibold">Categories</h2>
            <p className="text-body-sm text-ink-muted mt-0.5">
              Group your goals. Each category gets its own score on the dashboard. Drag to reorder.
            </p>
          </div>
          <Button
            size="sm"
            className="flex-none"
            icon={<Plus className="w-4 h-4" />}
            disabled={atLimit || !categories}
            onClick={() => setDialog({})}
            aria-describedby={atLimit ? "category-limit" : undefined}
          >
            New category
          </Button>
        </div>
        {atLimit && (
          <p id="category-limit" className="text-body-sm text-ink-muted mb-2">
            You have {MAX_CATEGORIES} categories, the most allowed. Delete one to add another.
          </p>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-3 mt-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : isError || !categories ? (
          <ErrorState message="Couldn't load your categories." onRetry={() => refetch()} />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <ol aria-label="Categories">
                {categories.map((c) => (
                  <CategoryRow
                    key={c.id}
                    category={c}
                    onEdit={() => setDialog({ category: c })}
                    onDelete={() => (c.goal_count > 0 ? setToDelete(c) : deleteEmpty(c))}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </Card>
      <p className="text-body-sm text-ink-muted mt-4 flex gap-2">
        <Info className="w-4 h-4 flex-none mt-px" />
        Deleting a category asks where to move its goals. Default categories can be renamed and recoloured but not
        deleted.
      </p>

      {dialog && <CategoryDialog category={dialog.category} onClose={() => setDialog(null)} />}
      {toDelete && categories && (
        <MoveGoalsDialog
          category={toDelete}
          others={categories.filter((c) => c.id !== toDelete.id)}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}

function CategoryRow({ category, onEdit, onDelete }: { category: Category; onEdit: () => void; onDelete: () => void }) {
  // useSortable wires this row into the drag list: `transform` is where the
  // row should be drawn while something is being dragged.
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });
  const goals = category.goal_count === 0 ? "No goals yet" : `${category.goal_count} goal${category.goal_count === 1 ? "" : "s"}`;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      // Touch: long-press anywhere on the row starts a drag.
      {...dragHandlers(listeners).row}
      className={clsx(
        "grid grid-cols-[40px_minmax(0,1fr)_auto] md:grid-cols-[20px_40px_minmax(0,1fr)_auto] gap-3 md:gap-4 items-center py-3 border-t border-border first:border-t-0 bg-surface-1",
        isDragging && "relative z-10 shadow-modal rounded-md",
      )}
    >
      {/* Desktop handle: mouse drag, or focus it and use Space + arrow keys. */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...dragHandlers(listeners).handle}
        aria-label={`Reorder ${category.name}`}
        className="hidden md:grid place-items-center text-ink-subtle cursor-grab h-10 rounded-sm focus-visible:shadow-focus focus-visible:outline-none"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <EmojiTile emoji={category.emoji} color={category.color} />
      <div className="min-w-0">
        <b className="text-[15px] leading-5 font-semibold flex items-center gap-2 min-w-0">
          <span className="truncate">{category.name}</span>
          {category.is_default && (
            <span className="hidden md:inline text-label uppercase text-ink-muted bg-surface-2 rounded-sm px-2 py-1">Default</span>
          )}
        </b>
        <div className="text-body-sm text-ink-muted">{goals}</div>
      </div>
      <div className="flex gap-0.5">
        <IconButton label={`Edit ${category.name}`} onClick={onEdit}>
          <Pencil className="w-4 h-4" />
        </IconButton>
        <RowMenu category={category} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </li>
  );
}

function IconButton({ label, onClick, children, ...rest }: { label: string; onClick: () => void; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="w-10 h-10 rounded-md grid place-items-center text-ink-muted hover:text-ink hover:bg-surface-2 focus-visible:shadow-focus focus-visible:outline-none"
      {...rest}
    >
      {children}
    </button>
  );
}

/** ⋯ menu: Edit / Delete. Defaults can't be deleted, so Delete is disabled with a reason. */
function RowMenu({ category, onEdit, onDelete }: { category: Category; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "w-full text-left px-3 py-2 text-body-sm flex items-center gap-2 rounded-sm focus-visible:shadow-focus focus-visible:outline-none";
  return (
    <div className="relative" ref={ref}>
      <IconButton label={`More for ${category.name}`} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <MoreHorizontal className="w-4 h-4" />
      </IconButton>
      {open && (
        <div role="menu" aria-label={`${category.name} actions`} className="absolute right-0 top-11 z-20 w-52 bg-surface-3 rounded-md shadow-modal p-1">
          <button
            role="menuitem"
            type="button"
            className={item + " hover:bg-surface-2"}
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            <Pencil className="w-4 h-4" /> Edit
          </button>
          <button
            role="menuitem"
            type="button"
            disabled={category.is_default}
            title={category.is_default ? "Default categories can't be deleted" : undefined}
            className={item + (category.is_default ? " text-ink-subtle cursor-not-allowed" : " text-grade-d hover:bg-surface-2")}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
          {category.is_default && <p className="px-3 pb-2 text-[12px] text-ink-subtle">Default categories can't be deleted.</p>}
        </div>
      )}
    </div>
  );
}

/** Delete a category that still has goals: pick where they go first. */
function MoveGoalsDialog({ category, others, onClose }: { category: Category; others: Category[]; onClose: () => void }) {
  const [target, setTarget] = useState<string>(others[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const deleteCategory = useDeleteCategory();
  const { showToast } = useToast();
  const n = category.goal_count;
  const targetName = others.find((c) => c.id === target)?.name ?? "";

  async function confirm() {
    setError(null);
    try {
      await deleteCategory.mutateAsync({ id: category.id, moveTo: target });
      showToast(`Deleted "${category.name}". ${n} goal${n === 1 ? "" : "s"} moved to ${targetName}.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete that category.");
    }
  }

  return (
    <Modal label={`Delete ${category.name}`} eyebrow="Settings · Categories" title={`Delete "${category.name}"?`} onClose={onClose} width={480} zIndex="z-40">
      <p className="text-body text-ink-muted">
        It has {n} goal{n === 1 ? "" : "s"} (archived ones included). Pick a category to move {n === 1 ? "it" : "them"} to.
        Scores and check-ins stay as they are.
      </p>
      <div className="flex flex-wrap gap-2 mt-4" role="group" aria-label="Move goals to">
        {others.map((c) => (
          <CategoryChip key={c.id} category={c} size="lg" selected={c.id === target} onClick={() => setTarget(c.id)} />
        ))}
      </div>
      {error && (
        <p className="text-body-sm text-grade-d mt-3" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" className="hidden md:inline-flex" onClick={onClose} data-autofocus>
          Cancel
        </Button>
        <Button
          variant="danger"
          className="flex-1 md:flex-none justify-center"
          disabled={!target || deleteCategory.isPending}
          onClick={confirm}
        >
          {deleteCategory.isPending ? "Deleting…" : `Move to ${targetName} and delete`}
        </Button>
      </div>
    </Modal>
  );
}
