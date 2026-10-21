import { useState, type FormEvent } from "react";
import Button from "./Button";
import CategoryChip from "./CategoryChip";
import ColourSwatches from "./ColourSwatches";
import EmojiPicker from "./EmojiPicker";
import EmojiTile from "./EmojiTile";
import Modal from "./Modal";
import clsx from "../lib/clsx";
import { ApiError } from "../api/client";
import { useCreateCategory, useUpdateCategory } from "../hooks/useCategories";
import { CATEGORY_NAME_MAX } from "../lib/identity";
import type { Category, IdentityColor } from "../api/types";

interface CategoryDialogProps {
  /** Present = edit this category; absent = create a new one. */
  category?: Category;
  /** Where it was opened from, shown as the eyebrow. */
  eyebrow?: string;
  onClose: () => void;
  onSaved?: (category: Category) => void;
}

/** Screen 12b: new / edit category. Modal on desktop, bottom sheet on mobile. */
export default function CategoryDialog({ category, eyebrow = "Settings · Categories", onClose, onSaved }: CategoryDialogProps) {
  const isEdit = !!category;
  const [name, setName] = useState(category?.name ?? "");
  const [emoji, setEmoji] = useState(category?.emoji ?? "🚀");
  const [color, setColor] = useState<IdentityColor>(category?.color ?? "pink");
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const create = useCreateCategory();
  const update = useUpdateCategory();
  const saving = create.isPending || update.isPending;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Give the category a name.");
      return;
    }
    if (trimmed.length > CATEGORY_NAME_MAX) {
      setNameError(`Keep it to ${CATEGORY_NAME_MAX} characters.`);
      return;
    }
    try {
      const saved = isEdit
        ? await update.mutateAsync({ id: category.id, body: { name: trimmed, emoji, color } })
        : await create.mutateAsync({ name: trimmed, emoji, color });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "CATEGORY_NAME_TAKEN") {
        setNameError(`You already have a category called "${trimmed}". Pick another name.`);
      } else if (err instanceof ApiError && err.code === "CATEGORY_LIMIT_REACHED") {
        setFormError("You already have 12 categories, the most you can have. Delete one first.");
      } else {
        setFormError(err instanceof Error ? err.message : "Couldn't save this category.");
      }
    }
  }

  const title = isEdit ? "Edit category" : "New category";
  return (
    <Modal label={title} eyebrow={eyebrow} title={title} onClose={onClose} width={480} zIndex="z-50">
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-5">
          <div className="flex gap-4 items-center">
            <EmojiTile emoji={emoji} color={color} size="lg" />
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <label htmlFor="category-name" className="text-body-sm font-medium text-ink-muted">
                Name
              </label>
              <input
                id="category-name"
                data-autofocus
                value={name}
                maxLength={CATEGORY_NAME_MAX}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
                aria-invalid={!!nameError}
                aria-describedby="category-name-help"
                className={clsx(
                  "bg-surface-2 border rounded-md p-3 text-body placeholder:text-ink-subtle outline-none focus:border-gold focus:shadow-focus",
                  nameError ? "border-grade-d" : "border-border-strong",
                )}
                placeholder="e.g. Side projects"
              />
              <span id="category-name-help" className={clsx("text-[12px] leading-4", nameError ? "text-grade-d" : "text-ink-subtle")}>
                {nameError ?? `Up to ${CATEGORY_NAME_MAX} characters`}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-body-sm font-medium text-ink-muted">Colour</span>
            <ColourSwatches value={color} onChange={setColor} />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-body-sm font-medium text-ink-muted">Emoji</span>
            <EmojiPicker selected={emoji} onSelect={setEmoji} compact maxHeight={104} />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-body-sm font-medium text-ink-muted">Preview</span>
            <div className="flex items-center gap-3 flex-wrap">
              <CategoryChip category={{ name: name.trim() || "Category name", emoji }} />
              <span className="text-body-sm text-ink-muted">on goal cards and filters</span>
            </div>
          </div>

          {formError && <p className="text-body-sm text-grade-d" role="alert">{formError}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-5 md:mt-6">
          <Button type="button" variant="ghost" className="hidden md:inline-flex" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="flex-1 md:flex-none justify-center">
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create category"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
