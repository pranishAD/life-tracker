import { describe, expect, it } from "vitest";
import {
  addTags,
  approxWords,
  entryDisplay,
  exportFilename,
  exportSummary,
  groupEntries,
  moodLabel,
  normalizeTag,
  presetRange,
  suggestedTags,
  wordCount,
} from "./journal";

describe("normalizeTag (contract JournalTag rules)", () => {
  it("lowercases, strips the leading #, trims and turns spaces into -", () => {
    expect(normalizeTag("#Gym")).toBe("gym");
    expect(normalizeTag("  Side   Project ")).toBe("side-project");
    expect(normalizeTag("##Study")).toBe("study");
    expect(normalizeTag("# deep work")).toBe("deep-work");
  });

  it("keeps letters (incl. Unicode), digits, _ and -", () => {
    expect(normalizeTag("itap_3010")).toBe("itap_3010");
    expect(normalizeTag("Café")).toBe("café");
    // Devanagari vowel signs are combining marks (\p{M}), not letters
    expect(normalizeTag("नेपाल")).toBe("नेपाल");
    expect(normalizeTag("#योग अभ्यास")).toBe("योग-अभ्यास");
  });

  it("rejects empty, too long, or invalid characters", () => {
    expect(normalizeTag("")).toBeNull();
    expect(normalizeTag("#")).toBeNull();
    expect(normalizeTag("   ")).toBeNull();
    expect(normalizeTag("a".repeat(33))).toBeNull();
    expect(normalizeTag("a".repeat(32))).toBe("a".repeat(32));
    expect(normalizeTag("gym!")).toBeNull();
    expect(normalizeTag("c++")).toBeNull();
  });
});

describe("addTags", () => {
  it("adds normalised tags, splits on commas, drops duplicates", () => {
    expect(addTags(["gym"], "Legs, #GYM, side project").tags).toEqual(["gym", "legs", "side-project"]);
  });

  it("stops at 10 tags and reports the rest as rejected", () => {
    const nine = Array.from({ length: 9 }, (_, i) => `t${i}`);
    const result = addTags(nine, "ten, eleven");
    expect(result.tags).toHaveLength(10);
    expect(result.tags[9]).toBe("ten");
    expect(result.rejected).toEqual(["eleven"]);
  });

  it("reports invalid tags as rejected", () => {
    expect(addTags([], "ok, bad!")).toEqual({ tags: ["ok"], rejected: ["bad!"] });
  });
});

describe("suggestedTags", () => {
  it("returns the most-used tags not already on the entry", () => {
    const all = ["gym", "study", "idea", "legs", "bihan"].map((tag) => ({ tag }));
    expect(suggestedTags(all, ["study"], 3)).toEqual(["gym", "idea", "legs"]);
  });
});

describe("entryDisplay (untitled-title rule)", () => {
  it("uses the title and the whole body when there is a title", () => {
    expect(entryDisplay({ title: "Leg day finally", body: "Squats felt heavy.\nBut ok." })).toEqual({
      title: "Leg day finally",
      excerpt: "Squats felt heavy. But ok.",
      untitled: false,
    });
  });

  it("uses the first sentence as the title and the rest as the excerpt", () => {
    expect(entryDisplay({ title: null, body: "Random thought: build a journal. Then export it for AI!" })).toEqual({
      title: "Random thought: build a journal.",
      excerpt: "Then export it for AI!",
      untitled: true,
    });
  });

  it("treats a blank title like no title", () => {
    expect(entryDisplay({ title: "   ", body: "Hello there? Yes." }).title).toBe("Hello there?");
  });

  it("stops at the first line break when the first line has no sentence end", () => {
    expect(entryDisplay({ title: null, body: "Grocery list\nmilk, eggs" })).toEqual({
      title: "Grocery list",
      excerpt: "milk, eggs",
      untitled: true,
    });
  });

  it("does not split on a dot inside a word (e.g. 3.5)", () => {
    expect(entryDisplay({ title: null, body: "Ran 3.5 km today. Felt good." }).title).toBe("Ran 3.5 km today.");
  });

  it("a single sentence has an empty excerpt", () => {
    expect(entryDisplay({ title: null, body: "  Just this.  " })).toEqual({ title: "Just this.", excerpt: "", untitled: true });
  });
});

describe("groupEntries", () => {
  // Saturday 17 Oct 2026, local time. This week starts Mon 12 Oct.
  const now = new Date(2026, 9, 17, 18, 0);
  const at = (y: number, m: number, d: number, h = 9) => ({ id: `${y}-${m}-${d}-${h}`, created_at: new Date(y, m - 1, d, h).toISOString() });

  it('groups into "This week", "Last week", then month names, keeping order', () => {
    const entries = [
      at(2026, 10, 17, 16),
      at(2026, 10, 12, 8), // Monday this week
      at(2026, 10, 11, 22), // Sunday last week
      at(2026, 10, 5), // Monday last week
      at(2026, 10, 4), // before last week, still October
      at(2026, 9, 30),
      at(2025, 12, 31),
    ];
    const groups = groupEntries(entries, now);
    expect(groups.map((g) => [g.label, g.entries.length])).toEqual([
      ["This week", 2],
      ["Last week", 2],
      ["October 2026", 1],
      ["September 2026", 1],
      ["December 2025", 1],
    ]);
    expect(groups[0].entries[0].id).toBe("2026-10-17-16");
  });

  it("returns no groups for no entries", () => {
    expect(groupEntries([], now)).toEqual([]);
  });
});

describe("misc helpers", () => {
  it("moodLabel", () => {
    expect([1, 2, 3, 4, 5].map(moodLabel)).toEqual(["Rough", "Low", "Okay", "Good", "Great"]);
  });

  it("wordCount", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("  one  two\nthree ")).toBe(3);
  });
});

describe("export helpers", () => {
  it("presetRange: last 30 days is inclusive of today (Sep 18 → Oct 17)", () => {
    expect(presetRange("30d", "2026-10-17")).toEqual({ from: "2026-09-18", to: "2026-10-17" });
    expect(presetRange("7d", "2026-10-17")).toEqual({ from: "2026-10-11", to: "2026-10-17" });
    expect(presetRange("month", "2026-10-17")).toEqual({ from: "2026-10-01", to: "2026-10-17" });
    expect(presetRange("all", "2026-10-17")).toEqual({ from: "", to: "2026-10-17" });
  });

  it("exportFilename prefers the server name", () => {
    expect(exportFilename("2026-09-18", "2026-10-17")).toBe("bihan-journal-2026-09-18-to-2026-10-17.md");
    expect(exportFilename("", "2026-10-17", "bihan-journal-2026-01-02-to-2026-10-17.md")).toBe(
      "bihan-journal-2026-01-02-to-2026-10-17.md",
    );
  });

  it("exportSummary", () => {
    expect(exportSummary({ entryCount: 24, wordCount: 6312, goalCount: 7 }, true)).toEqual({
      entries: "24 entries",
      rest: " · about 6,300 words · 7 goals",
    });
    expect(exportSummary({ entryCount: 1, wordCount: 42, goalCount: 0 }, false)).toEqual({
      entries: "1 entry",
      rest: " · about 42 words",
    });
    expect(exportSummary({ entryCount: 0, wordCount: 0, goalCount: 3 }, true)).toBeNull();
  });

  it("approxWords", () => {
    expect(approxWords(1)).toBe("about 1 word");
    expect(approxWords(149)).toBe("about 100 words");
  });
});
