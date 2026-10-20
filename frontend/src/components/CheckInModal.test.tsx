import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CheckInModal from "./CheckInModal";
import * as goalsApi from "../api/goals";
import * as scoringApi from "../api/scoring";
import { makeGoal } from "../test/factories";
import { renderRoute } from "../test/renderRoute";

describe("CheckInModal — Why this matters", () => {
  beforeEach(() => {
    vi.spyOn(scoringApi, "getGoalScore").mockResolvedValue({
      goal_id: "g1", pace: 0, consistency: 0, momentum: 0, effort: 0, total: null, grade: "Calibrating", is_frozen: false,
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows the goal's why under the picker when it has one", async () => {
    vi.spyOn(goalsApi, "listGoals").mockResolvedValue([
      makeGoal({ id: "g1", title: "Gym", type: "habit", frequency_type: "daily", why: "Play futsal again" }),
    ]);
    renderRoute("/", [{ path: "/", element: <CheckInModal goalId="g1" onClose={() => {}} /> }]);
    expect(await screen.findByText("Play futsal again")).toBeInTheDocument();
    expect(screen.getByText("Why this matters")).toBeInTheDocument();
  });

  it("shows nothing extra when the goal has no why", async () => {
    vi.spyOn(goalsApi, "listGoals").mockResolvedValue([makeGoal({ id: "g1", title: "Gym", why: null })]);
    renderRoute("/", [{ path: "/", element: <CheckInModal goalId="g1" onClose={() => {}} /> }]);
    expect(await screen.findByText("Gym")).toBeInTheDocument();
    expect(screen.queryByText("Why this matters")).not.toBeInTheDocument();
  });
});
