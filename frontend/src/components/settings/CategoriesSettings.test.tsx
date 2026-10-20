import { renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CategoriesSettings from "./CategoriesSettings";
import * as categoriesApi from "../../api/categories";
import { moveId, useReorderCategories } from "../../hooks/useCategories";
import { DEFAULT_CATEGORIES, makeCategory } from "../../test/factories";
import { FAKE_EMOJI_DATA, renderRoute } from "../../test/renderRoute";

vi.mock("@emoji-mart/data", () => ({ default: FAKE_EMOJI_DATA }));

const side = makeCategory({ id: "cat-side", name: "Side projects", goal_count: 2, sort_order: 4 });
const mind = makeCategory({ id: "cat-mind", name: "Mind", emoji: "🧘", color: "purple", goal_count: 0, sort_order: 5 });

function show() {
  return renderRoute("/settings", [{ path: "/settings", element: <CategoriesSettings /> }]);
}

beforeEach(() => {
  vi.spyOn(categoriesApi, "listCategories").mockResolvedValue([...DEFAULT_CATEGORIES, side, mind]);
});
afterEach(() => vi.restoreAllMocks());

describe("Settings › Categories (12)", () => {
  it("lists categories with Default chips and goal counts", async () => {
    show();
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(6);
    expect(within(rows[0]).getByText("Fitness")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Default")).toBeInTheDocument();
    expect(within(rows[0]).getByText("2 goals")).toBeInTheDocument();
    expect(within(rows[5]).getByText("No goals yet")).toBeInTheDocument();
    expect(within(rows[5]).queryByText("Default")).not.toBeInTheDocument();
  });

  it("default categories can't be deleted", async () => {
    const del = vi.spyOn(categoriesApi, "deleteCategory");
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "More for Fitness" }));
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
    expect(screen.getByText("Default categories can't be deleted.")).toBeInTheDocument();
    expect(del).not.toHaveBeenCalled();
  });

  it("deleting a category with goals asks where to move them, then sends move_to", async () => {
    const del = vi.spyOn(categoriesApi, "deleteCategory").mockResolvedValue();
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "More for Side projects" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    const dialog = screen.getByRole("dialog", { name: "Delete Side projects" });
    expect(within(dialog).getByText(/It has 2 goals/)).toBeInTheDocument();
    // The category being deleted is not offered as a target
    expect(within(dialog).queryByRole("button", { name: /Side projects/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /Study/ }));
    await user.click(within(dialog).getByRole("button", { name: "Move to Study and delete" }));

    await waitFor(() => expect(del).toHaveBeenCalledWith("cat-side", "cat-study"));
    expect(await screen.findByText('Deleted "Side projects". 2 goals moved to Study.')).toBeInTheDocument();
  });

  it("an empty category deletes straight away, and Undo recreates it in the same spot", async () => {
    const del = vi.spyOn(categoriesApi, "deleteCategory").mockResolvedValue();
    const restored = { ...mind, id: "cat-mind-2" };
    const create = vi.spyOn(categoriesApi, "createCategory").mockResolvedValue(restored);
    const reorder = vi.spyOn(categoriesApi, "reorderCategories").mockResolvedValue([]);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "More for Mind" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    await waitFor(() => expect(del).toHaveBeenCalledWith("cat-mind", undefined));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "Mind", emoji: "🧘", color: "purple" }));
    await waitFor(() =>
      expect(reorder).toHaveBeenCalledWith(["cat-fit", "cat-study", "cat-career", "cat-custom", "cat-side", "cat-mind-2"]),
    );
  });

  it("disables New category at 12 with a hint", async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => makeCategory({ id: `c${i}`, name: `Cat ${i}`, sort_order: i }));
    vi.spyOn(categoriesApi, "listCategories").mockResolvedValue(twelve);
    show();
    expect(await screen.findByText(/You have 12 categories, the most allowed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New category" })).toBeDisabled();
  });

  it("opens the edit dialog from the pencil button", async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Edit Mind" }));
    expect(screen.getByRole("dialog", { name: "Edit category" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Mind");
  });
});

describe("reorder payload", () => {
  const ids = ["a", "b", "c", "d"];

  it("moveId moves the dragged id onto the target's position", () => {
    expect(moveId(ids, "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(moveId(ids, "d", "a")).toEqual(["d", "a", "b", "c"]);
    expect(moveId(ids, "b", "b")).toBe(ids);
  });

  it("PATCHes every id in the new order and updates the cache optimistically", async () => {
    const reorder = vi.spyOn(categoriesApi, "reorderCategories").mockImplementation(
      () => new Promise(() => {}), // never resolves: lets us see the optimistic cache
    );
    const client = new QueryClient();
    client.setQueryData(["categories"], DEFAULT_CATEGORIES);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useReorderCategories(), { wrapper });

    const next = moveId(DEFAULT_CATEGORIES.map((c) => c.id), "cat-custom", "cat-fit");
    result.current.mutate(next);

    await waitFor(() => expect(reorder).toHaveBeenCalledWith(["cat-custom", "cat-fit", "cat-study", "cat-career"]));
    const cached = client.getQueryData<typeof DEFAULT_CATEGORIES>(["categories"])!;
    expect(cached.map((c) => [c.id, c.sort_order])).toEqual([
      ["cat-custom", 0],
      ["cat-fit", 1],
      ["cat-study", 2],
      ["cat-career", 3],
    ]);
  });
});
