import { describe, expect, it } from "vitest";
import type { EmojiMartData } from "@emoji-mart/data";
import { buildIndex, getRecentEmoji, pushRecentEmoji, searchEmoji, suggestForGoal } from "./emoji";
import { FAKE_EMOJI_DATA } from "../test/renderRoute";

const index = buildIndex(FAKE_EMOJI_DATA as unknown as EmojiMartData);

describe("emoji helpers", () => {
  it("indexes sections in picker order", () => {
    expect(index.sections.map((s) => s.label)).toEqual(["Activity", "Objects"]);
  });

  it("searches names and keywords, exact matches first", () => {
    expect(searchEmoji(index, "ship").map((e) => e.native)).toEqual(["🚀"]);
    expect(searchEmoji(index, "run").map((e) => e.native)).toEqual(["🏃"]);
    expect(searchEmoji(index, "")).toEqual([]);
  });

  it("suggests emoji from the goal name ('Suggested for running')", () => {
    expect(suggestForGoal(index, "Run 5 km under 28 min")?.label).toBe("running");
    expect(suggestForGoal(index, "Run 5 km")?.emojis[0]).toBe("🏃");
    // no curated match → falls back to a keyword search
    expect(suggestForGoal(index, "Launch party")?.emojis).toEqual(["🚀"]);
    expect(suggestForGoal(index, "")).toBeNull();
  });

  it("keeps recent picks newest first, without repeats", () => {
    localStorage.clear();
    pushRecentEmoji("🏃");
    pushRecentEmoji("📚");
    pushRecentEmoji("🏃");
    expect(getRecentEmoji()).toEqual(["🏃", "📚"]);
  });
});
