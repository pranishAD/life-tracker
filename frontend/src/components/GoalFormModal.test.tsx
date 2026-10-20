import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import GoalFormModal from "./GoalFormModal";
import * as goalsApi from "../api/goals";
import { ApiError } from "../api/client";
import { NUMBER_LIMITS, TEXT_LIMITS } from "../lib/limits";

// GoalFormModal uses React Query mutations, so it needs a QueryClient around
// it — the same thing main.tsx does for the real app.
function renderForm(type: "numeric" | "habit" = "numeric") {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GoalFormModal onClose={() => {}} initial={{ title: "Run", category: "fitness", type }} />
    </QueryClientProvider>,
  );
}

describe("GoalFormModal limits (SEC-006)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("puts the contract's maxLength on title, description and unit", () => {
    renderForm("numeric");
    expect(screen.getByLabelText("Title")).toHaveAttribute("maxLength", String(TEXT_LIMITS.goalTitle));
    expect(screen.getByLabelText("Description (optional)")).toHaveAttribute(
      "maxLength",
      String(TEXT_LIMITS.goalDescription),
    );
    expect(screen.getByLabelText("Unit")).toHaveAttribute("maxLength", String(TEXT_LIMITS.goalUnit));
  });

  it("rejects a target value of 1e10 or more before calling the API", async () => {
    const createSpy = vi.spyOn(goalsApi, "createGoal");
    const user = userEvent.setup();
    renderForm("numeric");

    await user.type(screen.getByLabelText("Target value"), String(NUMBER_LIMITS.targetValueMaxExclusive));
    await user.click(screen.getByRole("button", { name: "Create goal" }));

    expect(await screen.findByText(/Target value must be more than 0/)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("allows habit frequency up to 100 via the input's max attribute", () => {
    renderForm("habit");
    const freq = screen.getByLabelText("Times per week");
    expect(freq).toHaveAttribute("min", String(NUMBER_LIMITS.frequencyMin));
    expect(freq).toHaveAttribute("max", String(NUMBER_LIMITS.frequencyMax));
  });

  it("still shows the backend's message when the API answers 422", async () => {
    vi.spyOn(goalsApi, "createGoal").mockRejectedValue(
      new ApiError(422, "VALIDATION_ERROR", "title: String should have at most 200 characters"),
    );
    const user = userEvent.setup();
    renderForm("numeric");

    await user.click(screen.getByRole("button", { name: "Create goal" }));

    expect(await screen.findByText("title: String should have at most 200 characters")).toBeInTheDocument();
  });
});
