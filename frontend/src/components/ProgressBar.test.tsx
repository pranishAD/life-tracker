import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProgressBar from "./ProgressBar";

describe("ProgressBar a11y", () => {
  it("exposes progressbar role with value, bounds and default label", () => {
    render(<ProgressBar percent={42} grade="b" />);
    const bar = screen.getByRole("progressbar", { name: "Progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("clamps value and accepts a custom label", () => {
    render(<ProgressBar percent={150} grade="b" label="Read 12 books" />);
    expect(screen.getByRole("progressbar", { name: "Read 12 books" })).toHaveAttribute("aria-valuenow", "100");
  });

  it("clamps negatives to 0", () => {
    render(<ProgressBar percent={-5} grade="b" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });
});
