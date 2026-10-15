import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GradeBadge from "./GradeBadge";

describe("GradeBadge", () => {
  it("renders the letter and, when asked, the label", () => {
    render(<GradeBadge grade="a" showLabel />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("Strong")).toBeInTheDocument();
  });

  it("shows an ellipsis and 'Calibrating' for a goal under 3 days old (EC-07)", () => {
    render(<GradeBadge grade="cal" showLabel />);
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.getByText("Calibrating")).toBeInTheDocument();
  });

  it("omits the label when showLabel is false", () => {
    render(<GradeBadge grade="s" />);
    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.queryByText("Locked In")).not.toBeInTheDocument();
  });
});
