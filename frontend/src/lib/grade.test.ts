import { describe, expect, it } from "vitest";
import { gradeLabel, gradeToKey, keyToLetter, scoreToGradeKey } from "./grade";

describe("gradeToKey", () => {
  it("lowercases letter grades", () => {
    expect(gradeToKey("S")).toBe("s");
    expect(gradeToKey("A")).toBe("a");
    expect(gradeToKey("D")).toBe("d");
  });

  it('maps "Calibrating" to the "cal" key', () => {
    expect(gradeToKey("Calibrating")).toBe("cal");
  });
});

describe("keyToLetter", () => {
  it("shows an ellipsis for Calibrating instead of a letter", () => {
    expect(keyToLetter("cal")).toBe("…");
  });
  it("uppercases normal grade keys", () => {
    expect(keyToLetter("b")).toBe("B");
  });
});

describe("gradeLabel", () => {
  it("matches the labels in design/tokens.json", () => {
    expect(gradeLabel("s")).toBe("Locked In");
    expect(gradeLabel("a")).toBe("Strong");
    expect(gradeLabel("b")).toBe("On Track");
    expect(gradeLabel("c")).toBe("Slipping");
    expect(gradeLabel("d")).toBe("Off Track");
    expect(gradeLabel("cal")).toBe("Calibrating");
  });
});

// Thresholds from docs/master-plan.md section 4 "Grades":
// 90-100 S, 75-89 A, 60-74 B, 40-59 C, 0-39 D.
describe("scoreToGradeKey", () => {
  it.each([
    [100, "s"], [90, "s"],
    [89, "a"], [75, "a"],
    [74, "b"], [60, "b"],
    [59, "c"], [40, "c"],
    [39, "d"], [0, "d"],
  ] as const)("score %i -> grade %s", (score, expected) => {
    expect(scoreToGradeKey(score)).toBe(expected);
  });
});
