import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GoalFormPage from "./GoalFormPage";
import GoalTemplatesPage from "./GoalTemplatesPage";
import * as categoriesApi from "../api/categories";
import * as goalsApi from "../api/goals";
import * as scoringApi from "../api/scoring";
import * as checkinsApi from "../api/checkins";
import { ApiError } from "../api/client";
import { addDays, todayIso } from "../lib/date";
import { DEFAULT_CATEGORIES, makeCategory, makeGoal } from "../test/factories";
import { FAKE_EMOJI_DATA, renderRoute } from "../test/renderRoute";

// The emoji data is loaded with a dynamic import; give tests a tiny version.
vi.mock("@emoji-mart/data", () => ({ default: FAKE_EMOJI_DATA }));

const ROUTES = [
  { path: "/goals/new", element: <GoalTemplatesPage /> },
  { path: "/goals/new/details", element: <GoalFormPage /> },
  { path: "/goals/:goalId/edit", element: <GoalFormPage /> },
  { path: "/goals/:goalId", element: <div>Goal detail page</div> },
  { path: "/goals", element: <div>Goals list</div> },
];

function createSpy() {
  return vi.spyOn(goalsApi, "createGoal").mockImplementation(async (body) => makeGoal({ id: "new-1", ...body } as never));
}

beforeEach(() => {
  vi.spyOn(categoriesApi, "listCategories").mockResolvedValue(DEFAULT_CATEGORIES);
});
afterEach(() => vi.restoreAllMocks());

describe("Pick a start (screen 10)", () => {
  it("lists the templates under the user's categories and opens the form prefilled", async () => {
    const user = userEvent.setup();
    const r = renderRoute("/goals/new", ROUTES);
    expect(await screen.findByText("Run 5 km under 28 min")).toBeInTheDocument();
    expect(screen.getByText("Numeric · 32 → 28 min")).toBeInTheDocument();
    // Filter to Study only
    await user.click(screen.getByRole("button", { name: /Study/, pressed: false }));
    expect(screen.queryByText("Run 5 km under 28 min")).not.toBeInTheDocument();
    await user.click(screen.getByText("Finish an assignment"));
    expect(r.path()).toBe("/goals/new/details?template=finish-assignment");
    expect(await screen.findByDisplayValue("Finish an assignment")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Subtask 1" })).toHaveValue("Read the brief");
  });
});

describe("Goal details: create (screen 11)", () => {
  it("prefills from a template and creates the goal, then goes to its page", async () => {
    const spy = createSpy();
    const user = userEvent.setup();
    const r = renderRoute("/goals/new/details?template=run-5k", ROUTES);

    expect(await screen.findByDisplayValue("Run 5 km under 28 min")).toBeInTheDocument();
    expect(screen.getByText("From template: Run 5 km under 28 min")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fitness/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Numeric" })).toHaveAttribute("aria-pressed", "true");
    // Direction was set automatically
    expect(screen.getByRole("button", { name: "Decrease" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Set automatically: your target is lower than your start/)).toBeInTheDocument();
    expect(screen.getByText("4 min to go")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Create goal" })[0]);

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0][0]).toMatchObject({
      title: "Run 5 km under 28 min",
      category_id: "cat-fit",
      type: "numeric",
      start_value: 32,
      target_value: 28,
      unit: "min",
      direction: "decrease",
      emoji: "🏃",
      color: null,
    });
    await waitFor(() => expect(r.path()).toBe("/goals/new-1"));
  });

  it("re-derives the direction when the numbers change", async () => {
    const user = userEvent.setup();
    renderRoute("/goals/new/details", ROUTES);
    await user.type(await screen.findByLabelText("Goal name"), "Bench");
    await user.type(screen.getByLabelText("Start value"), "60");
    await user.type(screen.getByLabelText("Target value"), "80");
    expect(screen.getByRole("button", { name: "Increase" })).toHaveAttribute("aria-pressed", "true");
    await user.clear(screen.getByLabelText("Target value"));
    await user.type(screen.getByLabelText("Target value"), "50");
    expect(screen.getByRole("button", { name: "Decrease" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows an inline error (and doesn't send) when the direction override disagrees", async () => {
    const spy = createSpy();
    const user = userEvent.setup();
    renderRoute("/goals/new/details?template=run-5k", ROUTES);
    await user.click(await screen.findByRole("button", { name: "Increase" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/lower than your start, so lower is better/);
    const create = screen.getAllByRole("button", { name: "Create goal" })[0];
    expect(create).toBeDisabled();
    await user.click(create);
    expect(spy).not.toHaveBeenCalled();
  });

  it("habit: Per week stepper and Pick days send the right frequency payload", async () => {
    const spy = createSpy();
    const user = userEvent.setup();
    renderRoute("/goals/new/details?template=gym-4x-week", ROUTES);

    expect(await screen.findByText("4")).toBeInTheDocument(); // stepper value
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(screen.getAllByRole("button", { name: "Create goal" })[0]);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0][0]).toMatchObject({ type: "habit", frequency_type: "per_week", frequency_per_week: 5 });
  });

  it("habit: Pick days sends weekdays; at least one day stays on", async () => {
    const spy = createSpy();
    const user = userEvent.setup();
    renderRoute("/goals/new/details?template=meditate-10", ROUTES);
    await user.click(await screen.findByRole("button", { name: "Pick days" }));
    // default Mon/Wed/Fri → turn Wed and Fri off, then try to turn Mon off
    await user.click(screen.getByRole("button", { name: "Wednesday" }));
    await user.click(screen.getByRole("button", { name: "Friday" }));
    await user.click(screen.getByRole("button", { name: "Monday" }));
    expect(screen.getByRole("button", { name: "Monday" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Saturday" }));
    expect(screen.getByText("2 days a week · Mon, Sat")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Create goal" })[0]);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const body = spy.mock.calls[0][0];
    expect(body).toMatchObject({ frequency_type: "weekdays", weekdays: [1, 6] });
    expect(body).not.toHaveProperty("frequency_per_week");
  });

  it("habit: Every day sends daily", async () => {
    const spy = createSpy();
    const user = userEvent.setup();
    renderRoute("/goals/new/details?template=gym-4x-week", ROUTES);
    await user.click(await screen.findByRole("button", { name: "Every day" }));
    await user.click(screen.getAllByRole("button", { name: "Create goal" })[0]);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0][0]).toMatchObject({ frequency_type: "daily" });
    expect(spy.mock.calls[0][0]).not.toHaveProperty("frequency_per_week");
  });

  it("milestone: add subtasks with Enter, remove one, sent as `milestones`", async () => {
    const spy = createSpy();
    const user = userEvent.setup();
    renderRoute("/goals/new/details?type=milestone", ROUTES);
    await user.type(await screen.findByLabelText("Goal name"), "Launch the app");
    await user.click(screen.getByRole("button", { name: "Milestone" })); // already selected; no-op
    const input = screen.getByRole("textbox", { name: "New subtask" });
    await user.type(input, "Design{Enter}");
    await user.type(input, "Oops{Enter}");
    await user.type(input, "Build{Enter}");
    await user.click(screen.getByRole("button", { name: "Remove Oops" }));
    await user.type(screen.getByLabelText("Target date"), addDays(todayIso(), 20));

    await user.click(screen.getAllByRole("button", { name: "Create goal" })[0]);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0][0]).toMatchObject({
      type: "milestone",
      milestones: [{ title: "Design" }, { title: "Build" }],
      deadline: addDays(todayIso(), 20),
    });
  });

  it("'+ New category' opens the dialog and selects the new category", async () => {
    const created = makeCategory({ id: "cat-new", name: "Side projects" });
    vi.spyOn(categoriesApi, "createCategory").mockResolvedValue(created);
    const user = userEvent.setup();
    renderRoute("/goals/new/details", ROUTES);
    await user.click(await screen.findByRole("button", { name: "New category" }));
    const dialog = screen.getByRole("dialog", { name: "New category" });
    await user.type(within(dialog).getByLabelText("Name"), "Side projects");
    // the list refetches after create and now includes the new one
    vi.spyOn(categoriesApi, "listCategories").mockResolvedValue([...DEFAULT_CATEGORIES, created]);
    await user.click(within(dialog).getByRole("button", { name: "Create category" }));
    expect(await screen.findByRole("button", { name: /Side projects/, pressed: true })).toBeInTheDocument();
  });

  it("emoji picker: picking a colour sends it; never picking leaves color null", async () => {
    const spy = createSpy();
    const user = userEvent.setup();
    renderRoute("/goals/new/details?template=run-5k", ROUTES);
    await user.click(await screen.findByRole("button", { name: "Change emoji and colour" }));
    const picker = screen.getByRole("dialog", { name: "Pick emoji and colour" });
    expect(within(picker).getByText("Suggested for running")).toBeInTheDocument();
    await user.click(within(picker).getByRole("button", { name: "Rose" }));
    await user.click(await within(picker).findByRole("button", { name: "💪" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Pick emoji and colour" })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Create goal" })[0]);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0][0]).toMatchObject({ emoji: "💪", color: "rose" });
  });
});

describe("Goal details: edit (screen 11b)", () => {
  const habitGoal = makeGoal({
    id: "g9",
    title: "Gym 5 days a week",
    type: "habit",
    frequency_type: "per_week",
    frequency_per_week: 5,
    check_in_count: 23,
    why: "Play futsal again",
    start_date: "2026-10-01",
  });

  beforeEach(() => {
    vi.spyOn(scoringApi, "getGoalScore").mockResolvedValue({
      goal_id: "g9", pace: 0.9, consistency: 0.9, momentum: 0.5, effort: 0.8, total: 88, grade: "A", is_frozen: false,
    });
    vi.spyOn(checkinsApi, "listCheckIns").mockResolvedValue([]);
  });

  it("locks the type once the goal has check-ins and opens More options when it has values", async () => {
    vi.spyOn(goalsApi, "getGoal").mockResolvedValue(habitGoal);
    renderRoute("/goals/g9/edit", ROUTES);
    expect(await screen.findByText("Started Oct 1 · 23 check-ins")).toBeInTheDocument();
    for (const t of ["Numeric", "Habit", "Milestone"]) expect(screen.getByRole("button", { name: t })).toBeDisabled();
    expect(screen.getByText("Type can't change once a goal has check-ins.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /More options/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Why this matters")).toHaveValue("Play futsal again");
  });

  it("allows changing type while there are no check-ins", async () => {
    vi.spyOn(goalsApi, "getGoal").mockResolvedValue({ ...habitGoal, check_in_count: 0 });
    renderRoute("/goals/g9/edit", ROUTES);
    expect(await screen.findByRole("button", { name: "Numeric" })).toBeEnabled();
    expect(screen.queryByText("Type can't change once a goal has check-ins.")).not.toBeInTheDocument();
  });

  it("saves only the changes and goes back to the goal", async () => {
    vi.spyOn(goalsApi, "getGoal").mockResolvedValue(habitGoal);
    const patch = vi.spyOn(goalsApi, "updateGoal").mockImplementation(async (_id, body) => ({ ...habitGoal, ...body }) as never);
    const user = userEvent.setup();
    const r = renderRoute("/goals/g9/edit", ROUTES);
    await user.click(await screen.findByRole("button", { name: "Fewer" }));
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await waitFor(() => expect(patch).toHaveBeenCalledWith("g9", { frequency_per_week: 4 }));
    await waitFor(() => expect(r.path()).toBe("/goals/g9"));
  });

  it("shows TYPE_LOCKED from the server as a message", async () => {
    vi.spyOn(goalsApi, "getGoal").mockResolvedValue({ ...habitGoal, check_in_count: 0 });
    vi.spyOn(goalsApi, "updateGoal").mockRejectedValue(new ApiError(409, "TYPE_LOCKED", "locked"));
    const user = userEvent.setup();
    renderRoute("/goals/g9/edit", ROUTES);
    await user.click(await screen.findByRole("button", { name: "Every day" }));
    await user.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    expect(await screen.findByText("This goal already has check-ins, so its type can't change.")).toBeInTheDocument();
  });

  it("asks before discarding unsaved changes", async () => {
    vi.spyOn(goalsApi, "getGoal").mockResolvedValue(habitGoal);
    const user = userEvent.setup();
    const r = renderRoute("/goals/g9/edit", ROUTES);
    await user.type(await screen.findByLabelText("Goal name"), "!");
    await user.click(screen.getByRole("button", { name: "Goal" }));
    expect(screen.getByRole("alertdialog", { name: "Discard changes?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(r.path()).toBe("/goals/g9");
  });

  it("archives with PATCH status=archived", async () => {
    vi.spyOn(goalsApi, "getGoal").mockResolvedValue(habitGoal);
    const patch = vi.spyOn(goalsApi, "updateGoal").mockResolvedValue({ ...habitGoal, status: "archived" });
    const user = userEvent.setup();
    const r = renderRoute("/goals/g9/edit", ROUTES);
    await user.click(await screen.findByRole("button", { name: "Archive" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("g9", { status: "archived" }));
    await waitFor(() => expect(r.path()).toBe("/goals"));
  });

  it("delete asks for confirmation naming the goal", async () => {
    vi.spyOn(goalsApi, "getGoal").mockResolvedValue(habitGoal);
    const del = vi.spyOn(goalsApi, "deleteGoal").mockResolvedValue();
    const user = userEvent.setup();
    renderRoute("/goals/g9/edit", ROUTES);
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const confirm = screen.getByRole("alertdialog", { name: 'Delete "Gym 5 days a week"?' });
    await user.click(within(confirm).getByRole("button", { name: "Delete goal" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("g9"));
  });
});
