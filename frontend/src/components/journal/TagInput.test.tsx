import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import TagInput from "./TagInput";

function Harness({ initial = [] as string[], suggestions = [] as string[] }) {
  const [tags, setTags] = useState(initial);
  return (
    <>
      <TagInput tags={tags} onChange={setTags} suggestions={suggestions} />
      <output data-testid="tags">{tags.join(" ")}</output>
    </>
  );
}

const tagsText = () => screen.getByTestId("tags").textContent;

describe("TagInput", () => {
  it("Enter and comma add normalised tags", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText("Add tag");

    await user.type(input, "#Gym{Enter}");
    await user.type(input, "Side Project,");
    expect(tagsText()).toBe("gym side-project");
    expect(input).toHaveValue("");
  });

  it("Backspace on an empty input removes the last tag", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["gym", "legs"]} />);
    await user.type(screen.getByLabelText("Add tag"), "{Backspace}");
    expect(tagsText()).toBe("gym");
  });

  it("the x button removes that tag", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["gym", "legs"]} />);
    await user.click(screen.getByRole("button", { name: "Remove gym" }));
    expect(tagsText()).toBe("legs");
  });

  it("ignores duplicates, explains invalid tags, and stops at 10", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["a", "b", "c", "d", "e", "f", "g", "h", "i"]} />);
    const input = screen.getByLabelText("Add tag");

    await user.type(input, "A{Enter}");
    expect(tagsText()).toBe("a b c d e f g h i");

    await user.type(input, "bad!{Enter}");
    expect(screen.getByText(/letters, numbers, - and _/)).toBeInTheDocument();

    await user.type(input, "j{Enter}");
    expect(tagsText()).toBe("a b c d e f g h i j");
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("placeholder", "Max 10 tags");
  });

  it("clicking a suggestion adds it", async () => {
    const user = userEvent.setup();
    render(<Harness suggestions={["study", "idea"]} />);
    await user.click(screen.getByRole("button", { name: /idea/ }));
    expect(tagsText()).toBe("idea");
  });
});
