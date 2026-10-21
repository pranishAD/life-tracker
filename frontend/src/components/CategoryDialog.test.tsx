import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CategoryDialog from "./CategoryDialog";
import * as categoriesApi from "../api/categories";
import { ApiError } from "../api/client";
import { DEFAULT_CATEGORIES, makeCategory } from "../test/factories";
import { FAKE_EMOJI_DATA, renderRoute } from "../test/renderRoute";

vi.mock("@emoji-mart/data", () => ({ default: FAKE_EMOJI_DATA }));

function open(props: Partial<Parameters<typeof CategoryDialog>[0]> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  renderRoute("/", [{ path: "/", element: <CategoryDialog onClose={onClose} onSaved={onSaved} {...props} /> }]);
  return { onClose, onSaved };
}

describe("CategoryDialog (12b)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("requires a name and caps it at 24 characters", async () => {
    const spy = vi.spyOn(categoriesApi, "createCategory");
    const user = userEvent.setup();
    open();
    expect(screen.getByLabelText("Name")).toHaveAttribute("maxLength", "24");
    await user.type(screen.getByLabelText("Name"), "   ");
    await user.click(screen.getByRole("button", { name: "Create category" }));
    expect(screen.getByText("Give the category a name.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("creates with the picked name, emoji and colour, live preview included", async () => {
    const created = makeCategory({ name: "Mind", emoji: "📚", color: "purple" });
    const spy = vi.spyOn(categoriesApi, "createCategory").mockResolvedValue(created);
    const user = userEvent.setup();
    const { onSaved, onClose } = open();
    await user.type(screen.getByLabelText("Name"), "  Mind ");
    await user.click(screen.getByRole("button", { name: "Purple" }));
    expect(screen.getByRole("button", { name: "Purple" })).toHaveAttribute("aria-pressed", "true");
    await user.click(await screen.findByRole("button", { name: "📚" }));
    expect(screen.getByText("on goal cards and filters").previousSibling).toHaveTextContent("Mind");

    await user.click(screen.getByRole("button", { name: "Create category" }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ name: "Mind", emoji: "📚", color: "purple" }));
    expect(onSaved).toHaveBeenCalledWith(created);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows 409 CATEGORY_NAME_TAKEN as a field error and stays open", async () => {
    vi.spyOn(categoriesApi, "createCategory").mockRejectedValue(
      new ApiError(409, "CATEGORY_NAME_TAKEN", "A category with this name already exists"),
    );
    const user = userEvent.setup();
    const { onClose } = open();
    await user.type(screen.getByLabelText("Name"), "fitness");
    await user.click(screen.getByRole("button", { name: "Create category" }));
    expect(await screen.findByText('You already have a category called "fitness". Pick another name.')).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("edits an existing category with PATCH", async () => {
    const fitness = DEFAULT_CATEGORIES[0];
    const spy = vi.spyOn(categoriesApi, "updateCategory").mockResolvedValue({ ...fitness, name: "Gym" });
    const user = userEvent.setup();
    open({ category: fitness });
    expect(screen.getByRole("dialog", { name: "Edit category" })).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Gym");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith("cat-fit", { name: "Gym", emoji: "🏃", color: "teal" }));
  });
});
